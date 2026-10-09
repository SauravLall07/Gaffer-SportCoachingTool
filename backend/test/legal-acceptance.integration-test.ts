import { PGlite } from '@electric-sql/pglite';
import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { betterAuth } from 'better-auth';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableColumns } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseClient } from '../src/database/drizzle';
import * as schema from '../src/database/schema';
import {
  legalAcceptanceAdapter,
  legalAcceptanceBefore,
  legalAcceptanceUserHooks,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '../src/auth/legal-acceptance';

const origin = 'http://localhost:5173';
const baseURL = 'http://localhost:3000';
const password = 'GafferTest1!';
const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

describe('legal acceptance through the real Better Auth lifecycle', () => {
  const pg = new PGlite();
  const local = drizzle(pg, { schema });
  // PGlite supplies local PostgreSQL. Production uses neon-http's atomic
  // batch; this bridge runs the same generated statements in a transaction.
  const db = Object.assign(local, {
    batch: async (queries: { toSQL(): { sql: string; params: unknown[] } }[]) =>
      pg.transaction(async (tx) => {
        const results: unknown[] = [];
        for (const [index, query] of queries.entries()) {
          const { sql, params } = query.toSQL();
          const result = await tx.query(sql, params);
          results.push(
            index === 0
              ? result.rows.map((row) =>
                  Object.fromEntries(
                    Object.entries(getTableColumns(schema.user)).map(
                      ([key, column]) => [
                        key,
                        (row as Record<string, unknown>)[column.name],
                      ],
                    ),
                  ),
                )
              : result,
          );
        }
        return results;
      }),
  }) as unknown as DatabaseClient;
  const sendVerificationEmail = jest.fn(async () => {});
  const auth = betterAuth({
    secret: 'local-legal-acceptance-test-secret-32-characters',
    baseURL,
    basePath: '/auth',
    trustedOrigins: [origin],
    database: legalAcceptanceAdapter(db),
    hooks: { before: legalAcceptanceBefore },
    databaseHooks: { user: legalAcceptanceUserHooks },
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    emailVerification: { sendOnSignUp: true, sendVerificationEmail },
    socialProviders: {
      google: { clientId: 'local-google', clientSecret: 'local-secret' },
    },
    advanced: { disableOriginCheck: false },
    logger: { disabled: true },
  });
  let googleIdentity = {
    id: 'google-new',
    email: 'google-new@example.test',
    name: 'Google User',
    emailVerified: true,
  };

  beforeAll(async () => {
    await pg.exec(`
      CREATE TYPE sex AS ENUM ('male', 'female', 'prefer_not_to_say');
      CREATE TABLE "user" (
        id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
        email_verified boolean NOT NULL DEFAULT false, image text,
        phone_number text, sex sex, date_of_birth date,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE session (
        id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        ip_address text, user_agent text, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
      );
      CREATE TABLE account (
        id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz,
        refresh_token_expires_at timestamptz, scope text, password text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE verification (
        id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pg.exec(
      readFileSync(
        resolve(process.cwd(), 'drizzle/0064_legal_acceptance.sql'),
        'utf8',
      ),
    );
    const context = await auth.$context;
    const google = context.socialProviders.find(
      (provider) => provider.id === 'google',
    )!;
    // Stub only Google's remote service; state validation, adapter, hooks,
    // callback, sessions and all persistence run as production Better Auth.
    google.createAuthorizationURL = ({ state }) =>
      Promise.resolve(new URL(`https://accounts.google.test/?state=${state}`));
    google.validateAuthorizationCode = () =>
      Promise.resolve({
        accessToken: 'local-access-token',
        tokenType: 'Bearer',
      });
    google.getUserInfo = () =>
      Promise.resolve({
        user: googleIdentity,
        data: {
          sub: googleIdentity.id,
          email: googleIdentity.email,
          email_verified: true,
        },
      });
  });
  afterAll(async () => pg.close());

  async function signup(email: string, extra: Record<string, unknown> = {}) {
    return auth.handler(
      new Request(`${baseURL}/auth/sign-up/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Email User', email, password, ...extra }),
      }),
    );
  }
  async function startGoogle(extra: Record<string, unknown> = {}) {
    const response = await auth.handler(
      new Request(`${baseURL}/auth/sign-in/social`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: `${origin}/oauth/callback`,
          errorCallbackURL: `${origin}/signup`,
          additionalData: extra,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    return {
      state: new URL(body.url).searchParams.get('state')!,
      cookie: cookieHeader(response),
    };
  }
  function callback(flow: { state: string; cookie: string }, extra = '') {
    return auth.handler(
      new Request(
        `${baseURL}/auth/callback/google?code=local-code&state=${flow.state}${extra}`,
        {
          headers: { cookie: flow.cookie },
        },
      ),
    );
  }
  async function records(email: string) {
    return (
      await pg.query(
        `SELECT a.*, u.email FROM legal_acceptance a JOIN "user" u ON u.id = a.user_id WHERE u.email = $1`,
        [email],
      )
    ).rows;
  }
  async function expectNoUser(email: string) {
    expect(
      (await pg.query('SELECT id FROM "user" WHERE email = $1', [email])).rows,
    ).toEqual([]);
  }

  it('saves email signup acceptance with server versions, time and the actual user ID', async () => {
    const before = Date.now();
    const response = await signup('email-valid@example.test', {
      termsAccepted: true,
      termsVersion: 'forged',
      privacyVersion: 'forged',
      acceptedAt: '2000-01-01',
      method: 'google_signup',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    const body = (await response.json()) as { user: { id: string } };
    const rows = await records('email-valid@example.test');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: body.user.id,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      method: 'email_signup',
    });
    expect(
      new Date((rows[0] as { accepted_at: Date }).accepted_at).getTime(),
    ).toBeGreaterThanOrEqual(before);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, false, 'true', 1, null])(
    'rejects direct email signup with termsAccepted=%p',
    async (termsAccepted) => {
      const email = `missing-${String(termsAccepted)}@example.test`;
      const response = await signup(email, { termsAccepted });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
      });
      await expectNoUser(email);
    },
  );

  it('keeps duplicate email signup from creating duplicate acceptance records', async () => {
    expect(
      (await signup('email-valid@example.test', { termsAccepted: true }))
        .status,
    ).toBe(200);
    expect(await records('email-valid@example.test')).toHaveLength(1);
  });

  it('saves Google signup acceptance after a verified OAuth redirect', async () => {
    const response = await callback(
      await startGoogle({
        termsAccepted: true,
        gafferLegalAcceptance: { termsVersion: 'forged' },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${origin}/oauth/callback`);
    expect(response.headers.get('set-cookie')).toContain('session_token');
    expect(await records(googleIdentity.email)).toEqual([
      expect.objectContaining({
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        method: 'google_signup',
      }),
    ]);
  });

  it('lets returning Google users sign in without repeated acceptance', async () => {
    const response = await callback(await startGoogle());
    expect(response.headers.get('location')).toBe(`${origin}/oauth/callback`);
    expect(response.headers.get('set-cookie')).toContain('session_token');
    expect(await records(googleIdentity.email)).toHaveLength(1);
  });

  it('blocks Google signup without consent even with forged additional data and callback flags', async () => {
    googleIdentity = {
      ...googleIdentity,
      id: 'google-missing',
      email: 'google-missing@example.test',
    };
    const flow = await startGoogle({
      termsAccepted: false,
      gafferLegalAcceptance: {
        method: 'google_signup',
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
      serverContext: {
        gafferLegalAcceptance: {
          method: 'google_signup',
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        },
      },
    });
    const response = await callback(flow, '&termsAccepted=true');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(
      `${origin}/signup?error=`,
    );
    expect(
      new URL(response.headers.get('location')!).searchParams.get('error'),
    ).toBe('LEGAL_ACCEPTANCE_REQUIRED');
    expect(response.headers.get('set-cookie') ?? '').not.toContain(
      'session_token',
    );
    await expectNoUser(googleIdentity.email);
    // The user can subsequently check the same signup checkbox and retry.
    const retry = await callback(await startGoogle({ termsAccepted: true }));
    expect(retry.headers.get('location')).toBe(`${origin}/oauth/callback`);
    expect(await records(googleIdentity.email)).toHaveLength(1);
  });

  it('rejects tampered state and replayed OAuth callbacks', async () => {
    googleIdentity = {
      ...googleIdentity,
      id: 'google-state',
      email: 'google-state@example.test',
    };
    const flow = await startGoogle({ termsAccepted: true });
    const tampered = await callback({ ...flow, state: `${flow.state}forged` });
    expect(tampered.headers.get('location')).not.toBe(
      `${origin}/oauth/callback`,
    );
    await expectNoUser(googleIdentity.email);
    const valid = await callback(flow);
    expect(valid.headers.get('location')).toBe(`${origin}/oauth/callback`);
    const replay = await callback(flow);
    expect(replay.headers.get('location')).not.toBe(`${origin}/oauth/callback`);
    expect(await records(googleIdentity.email)).toHaveLength(1);
  });

  it('does not let direct Google ID-token signup bypass the verified redirect requirement', async () => {
    googleIdentity = {
      ...googleIdentity,
      id: 'google-direct',
      email: 'google-direct@example.test',
    };
    const google = (await auth.$context).socialProviders.find(
      (provider) => provider.id === 'google',
    )!;
    google.verifyIdToken = () => Promise.resolve(true);
    const response = await auth.handler(
      new Request(`${baseURL}/auth/sign-in/social`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          idToken: { token: 'local-verified-token' },
          additionalData: { termsAccepted: true },
        }),
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get('set-cookie') ?? '').not.toContain(
      'session_token',
    );
    await expectNoUser(googleIdentity.email);
  });

  it('preserves login for legacy Google users with no acceptance records', async () => {
    googleIdentity = {
      ...googleIdentity,
      id: 'google-new',
      email: 'google-new@example.test',
    };
    await pg.exec(
      'DELETE FROM legal_acceptance WHERE user_id IN (SELECT id FROM "user" WHERE email = \'google-new@example.test\')',
    );
    const response = await callback(await startGoogle());
    expect(response.headers.get('location')).toBe(`${origin}/oauth/callback`);
    expect(response.headers.get('set-cookie')).toContain('session_token');
    expect(await records(googleIdentity.email)).toHaveLength(0);
  });

  it.each(['email', 'google'])(
    'rolls back the new user on %s acceptance persistence failure',
    async (method) => {
      const email = `failure-${method}@example.test`;
      const emailsSent = sendVerificationEmail.mock.calls.length;
      await pg.exec(
        'ALTER TABLE legal_acceptance ADD CONSTRAINT test_failure CHECK (false) NOT VALID',
      );
      try {
        if (method === 'email') {
          expect(
            (await signup(email, { termsAccepted: true })).status,
          ).toBeGreaterThanOrEqual(400);
        } else {
          googleIdentity = { ...googleIdentity, id: 'google-failure', email };
          const response = await callback(
            await startGoogle({ termsAccepted: true }),
          );
          expect(response.headers.get('location')).not.toBe(
            `${origin}/oauth/callback`,
          );
          expect(response.headers.get('set-cookie') ?? '').not.toContain(
            'session_token',
          );
        }
        await expectNoUser(email);
        expect(sendVerificationEmail.mock.calls).toHaveLength(emailsSent);
        expect(await records(email)).toHaveLength(0);
      } finally {
        await pg.exec(
          'ALTER TABLE legal_acceptance DROP CONSTRAINT test_failure',
        );
      }
    },
  );

  it('allows existing email users without acceptance records to keep logging in', async () => {
    await pg.exec(
      'UPDATE "user" SET email_verified = true WHERE email = \'email-valid@example.test\'; DELETE FROM legal_acceptance WHERE user_id IN (SELECT id FROM "user" WHERE email = \'email-valid@example.test\')',
    );
    const response = await auth.handler(
      new Request(`${baseURL}/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'email-valid@example.test', password }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('session_token');
  });

  it('enforces uniqueness, the user foreign key and account-deletion cleanup in PostgreSQL', async () => {
    const [row] = (await records('google-state@example.test')) as {
      user_id: string;
    }[];
    await expect(
      pg.query(
        'INSERT INTO legal_acceptance (user_id, terms_version, privacy_version, method) VALUES ($1, $2, $3, $4)',
        [row.user_id, TERMS_VERSION, PRIVACY_VERSION, 'google_signup'],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        'INSERT INTO legal_acceptance (user_id, terms_version, privacy_version, method) VALUES ($1, $2, $3, $4)',
        ['unknown-user', TERMS_VERSION, PRIVACY_VERSION, 'email_signup'],
      ),
    ).rejects.toThrow();
    await pg.query('DELETE FROM "user" WHERE id = $1', [row.user_id]);
    expect(await records('google-state@example.test')).toHaveLength(0);
  });
});
