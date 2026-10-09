import { randomUUID } from 'node:crypto';
import type { BetterAuthOptions, DBAdapter } from 'better-auth/types';
import {
  APIError,
  addOAuthServerContext,
  createAuthMiddleware,
  getOAuthState,
} from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DatabaseClient } from '../database/drizzle';
import * as schema from '../database/schema';

// Versions identify the existing documents' effective dates. Update these
// deliberately when publishing new documents; never accept client versions.
export const TERMS_VERSION = '2026-10-05';
export const PRIVACY_VERSION = '2026-10-05';
const OAUTH_ACCEPTANCE_KEY = 'gafferLegalAcceptance';
const acceptanceKey = Symbol('server-validated legal acceptance');
type Acceptance = {
  termsVersion: string;
  privacyVersion: string;
  method: 'email_signup' | 'google_signup';
};
type ConsentBody = {
  termsAccepted?: unknown;
  provider?: unknown;
  additionalData?: Record<string, unknown>;
};

function requireAcceptance(value: unknown): void {
  if (value !== true) {
    throw new APIError('BAD_REQUEST', {
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      message:
        'You must agree to the Terms of Service and Privacy Policy to register.',
    });
  }
}

const currentAcceptance = (method: Acceptance['method']): Acceptance => ({
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  method,
});

export const legalAcceptanceBefore = createAuthMiddleware(async (ctx) => {
  const body = ctx.body as ConsentBody | undefined;
  if (ctx.path === '/sign-up/email') {
    requireAcceptance(body?.termsAccepted);
  }
  if (ctx.path === '/sign-in/social' && body) {
    // Better Auth's server-only state slot cannot be populated by the client.
    // State, its signed browser cookie and expiry bind this to one redirect.
    const additionalData = body.additionalData ?? {};
    await addOAuthServerContext({
      [OAUTH_ACCEPTANCE_KEY]:
        body.provider === 'google' && additionalData.termsAccepted === true
          ? currentAcceptance('google_signup')
          : null,
    });
  }
});

export const legalAcceptanceUserHooks: NonNullable<
  BetterAuthOptions['databaseHooks']
>['user'] = {
  create: {
    before: async (user, ctx) => {
      let acceptance: Acceptance;
      if (ctx?.path === '/sign-up/email') {
        requireAcceptance((ctx.body as ConsentBody | undefined)?.termsAccepted);
        acceptance = currentAcceptance('email_signup');
      } else if (ctx?.path === '/callback/:id' && ctx.params?.id === 'google') {
        // getOAuthState is populated only after Better Auth verifies and
        // consumes the state. Never read consent from the callback request.
        const state = await getOAuthState();
        const stored = state?.serverContext?.[OAUTH_ACCEPTANCE_KEY] as
          Acceptance | undefined;
        requireAcceptance(
          stored?.method === 'google_signup' &&
            stored.termsVersion === TERMS_VERSION &&
            stored.privacyVersion === PRIVACY_VERSION,
        );
        acceptance = currentAcceptance('google_signup');
      } else {
        // Includes direct ID-token signup and any future registration route
        // that has not implemented verified legal consent.
        requireAcceptance(false);
        return;
      }
      // A Symbol cannot be populated by a JSON request. The adapter consumes
      // this private value before writing any user data.
      return { data: { ...user, [acceptanceKey]: acceptance } };
    },
  },
};

/** Preserve Better Auth's adapter except for atomic user + consent creation. */
export function legalAcceptanceAdapter(db: DatabaseClient) {
  const base = drizzleAdapter(db, {
    provider: 'pg',
    schema,
    transaction: false,
  });
  return (options: BetterAuthOptions): DBAdapter => {
    const adapter = base(options);
    const create: DBAdapter['create'] = async <
      T extends Record<string, unknown>,
      R = T,
    >(input: {
      model: string;
      data: Omit<T, 'id'>;
      select?: string[];
      forceAllowId?: boolean;
    }): Promise<R> => {
      if (input.model !== 'user') return adapter.create<T, R>(input);
      const data = input.data as typeof input.data & {
        [acceptanceKey]?: Acceptance;
      };
      const acceptance = data[acceptanceKey];
      requireAcceptance(Boolean(acceptance));
      const userData = { ...data };
      delete userData[acceptanceKey];
      const user = {
        ...userData,
        id: typeof userData.id === 'string' ? userData.id : randomUUID(),
      } as unknown as typeof schema.user.$inferInsert;
      // neon-http batch uses a single PostgreSQL transaction. If the consent
      // insert fails, the user insert rolls back too, before any account,
      // verification email or session can be created by Better Auth.
      const [users] = await db.batch([
        db.insert(schema.user).values(user).returning(),
        db.insert(schema.legalAcceptance).values({
          userId: user.id,
          ...acceptance!,
          // acceptedAt uses PostgreSQL's default now().
        }),
      ]);
      const result = input.select
        ? Object.fromEntries(input.select.map((key) => [key, users[0][key]]))
        : users[0];
      return result as R;
    };
    const wrapped: DBAdapter = {
      ...adapter,
      create,
      // The stock no-transaction fallback closes over the original adapter.
      // Keep our create override in Better Auth's transaction context too.
      transaction: async (callback) => callback(wrapped),
    };
    return wrapped;
  };
}
