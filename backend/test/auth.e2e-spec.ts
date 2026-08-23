import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { sendVerificationEmail } from '../src/email/email';
import {
  cleanupUser,
  uniqueTestIdentity,
  verifyUserEmail,
  type TestIdentity,
} from './utils/test-db';

// This suite signs up far more coaches than any other, and needs to read
// back the exact verification link Better Auth generates for the "real
// link" flow below — so unlike the other e2e suites (which go through
// `registerCoach` and let sign-up email for real via Brevo), this one mocks
// the send at our own module boundary. That's both deterministic and avoids
// firing that many real transactional emails at made-up @example.com
// addresses on every test run.
jest.mock('../src/email/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockSendVerificationEmail = sendVerificationEmail as jest.MockedFunction<
  typeof sendVerificationEmail
>;

const PASSWORD = 'password123';

interface SessionUserBody {
  id: string;
  name: string;
  email: string;
}

interface SessionTeamBody {
  id: string;
  name: string;
  role: string;
}

interface AuthResponseBody {
  user: SessionUserBody;
  team: SessionTeamBody | null;
}

interface SignUpResponseBody {
  user: SessionUserBody;
  emailVerificationRequired: boolean;
}

interface ErrorResponseBody {
  message: string;
}

/**
 * Reads back the verification link Better Auth generated for `email`, via
 * the mocked `sendVerificationEmail` — this is exactly the URL a coach would
 * click from their inbox, `token` and `callbackURL` both included. Sign-up
 * kicks the send off without awaiting it (Better Auth's
 * `runInBackgroundOrAwait`), so this polls briefly rather than assuming the
 * mock has already been called the instant the sign-up response comes back.
 */
async function captureVerificationLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const call = mockSendVerificationEmail.mock.calls.find(
      ([{ to }]) => to === email,
    );
    if (call) {
      return call[0].url;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`sendVerificationEmail was never called for ${email}.`);
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await Promise.all(identities.map(cleanupUser));
    await app.close();
  });

  /** Registers a fresh identity for one test and queues it for cleanup. */
  function newIdentity(): TestIdentity {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    return identity;
  }

  describe('POST /auth/sign-up', () => {
    it('creates an unverified user and withholds the session until the email is confirmed', async () => {
      const { email } = newIdentity();

      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Ada Lovelace', email, password: PASSWORD })
        .expect(201);
      const body = response.body as SignUpResponseBody;

      expect(body.user).toMatchObject({ email, name: 'Ada Lovelace' });
      expect(body.emailVerificationRequired).toBe(true);
      // requireEmailVerification withholds the session cookie entirely —
      // sign-up no longer signs the coach in the way it used to.
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a payload that fails validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: '', email: 'not-an-email', password: 'short' })
        .expect(400);
      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(expect.any(String));
    });

    it('does not reveal that an email is already registered', async () => {
      const { email } = newIdentity();
      const body = { name: 'Ada Lovelace', email, password: PASSWORD };

      const firstResponse = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(body)
        .expect(201);

      // `requireEmailVerification` makes Better Auth respond to a repeat
      // sign-up with the same 201 shape and a synthetic user (a fresh fake
      // id, not the real account's) instead of an error — enumerating
      // registered emails would otherwise be trivial. The real account
      // underneath is untouched: no second row, same original id.
      const secondResponse = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(body)
        .expect(201);

      const firstBody = firstResponse.body as SignUpResponseBody;
      const secondBody = secondResponse.body as SignUpResponseBody;

      expect(secondBody.user.email).toEqual(email);
      expect(secondBody.user.id).not.toEqual(firstBody.user.id);
    });
  });

  describe('email verification', () => {
    beforeEach(() => {
      mockSendVerificationEmail.mockClear();
    });

    it('rejects sign-in until the address is verified', async () => {
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Rosalind Franklin', email, password: PASSWORD })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email, password: PASSWORD });

      // LoginPage specifically branches on 403 to show a "resend the link"
      // action, so this is asserted exactly rather than just "some 4xx".
      expect(response.status).toBe(403);
    });

    it('lets a coach through the real link, then sign in, once verified', async () => {
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Katherine Johnson', email, password: PASSWORD })
        .expect(201);

      const link = await captureVerificationLink(email);
      const { pathname, search } = new URL(link);

      // Following the exact link a coach would click — token and
      // callbackURL together — is what makes Better Auth redirect instead
      // of just responding with JSON; see `email-verification.mjs`.
      const verifyResponse = await request(app.getHttpServer()).get(
        `${pathname}${search}`,
      );

      expect(verifyResponse.status).toBe(302);
      expect(verifyResponse.headers.location).toContain('/login?verified=1');

      const signInResponse = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email, password: PASSWORD })
        .expect(201);

      expect(signInResponse.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /auth/send-verification-email', () => {
    it('accepts a resend request for an unverified account', async () => {
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Margaret Hamilton', email, password: PASSWORD })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/send-verification-email')
        .send({ email })
        .expect(201);

      expect(response.body).toEqual({ status: true });
    });

    it('returns the same response for an unknown email, so it cannot be used to probe accounts', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/send-verification-email')
        .send({ email: uniqueTestIdentity().email })
        .expect(201);

      expect(response.body).toEqual({ status: true });
    });
  });

  describe('POST /auth/sign-in', () => {
    /** Signs up and immediately verifies a fresh identity via the DB shortcut. */
    async function newVerifiedIdentity(nameForSignUp: string): Promise<TestIdentity> {
      const identity = newIdentity();
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: nameForSignUp, email: identity.email, password: PASSWORD })
        .expect(201);
      await verifyUserEmail(identity.email);
      return identity;
    }

    it('signs a verified user in and sets a session cookie', async () => {
      const { email } = await newVerifiedIdentity('Grace Hopper');

      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email, password: PASSWORD })
        .expect(201);
      const body = response.body as AuthResponseBody;

      expect(body.user).toMatchObject({ email });
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('rejects an unknown email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: uniqueTestIdentity().email, password: PASSWORD });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it('rejects the wrong password', async () => {
      const { email } = await newVerifiedIdentity('Grace Hopper');

      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email, password: 'wrong-password' });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /auth/session', () => {
    it('returns 401 when there is no session', async () => {
      await request(app.getHttpServer()).get('/auth/session').expect(401);
    });

    it('returns the current user and a null team for a verified coach who has not created a team yet', async () => {
      const identity = newIdentity();
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/auth/sign-up')
        .send({ name: 'Katherine Johnson', email: identity.email, password: PASSWORD })
        .expect(201);
      await verifyUserEmail(identity.email);
      await agent
        .post('/auth/sign-in')
        .send({ email: identity.email, password: PASSWORD })
        .expect(201);

      const response = await agent.get('/auth/session').expect(200);
      const body = response.body as AuthResponseBody;

      // Team creation is now its own `POST /teams` step (see
      // `teams.e2e-spec.ts`) rather than something sign-up bundles in.
      expect(body.user).toMatchObject({ email: identity.email });
      expect(body.team).toBeNull();
    });
  });

  describe('POST /auth/sign-out', () => {
    it('rejects sign-out with no session', async () => {
      await request(app.getHttpServer()).post('/auth/sign-out').expect(401);
    });

    it('clears the session so a later /auth/session call is unauthenticated', async () => {
      const identity = newIdentity();
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/auth/sign-up')
        .send({ name: 'Margaret Hamilton', email: identity.email, password: PASSWORD })
        .expect(201);
      await verifyUserEmail(identity.email);
      await agent
        .post('/auth/sign-in')
        .send({ email: identity.email, password: PASSWORD })
        .expect(201);

      await agent.get('/auth/session').expect(200);
      await agent.post('/auth/sign-out').expect(201);
      await agent.get('/auth/session').expect(401);
    });
  });
});
