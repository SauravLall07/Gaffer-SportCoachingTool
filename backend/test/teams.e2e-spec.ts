import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  cleanupUser,
  uniqueTestIdentity,
  verifyUserEmail,
  type TestIdentity,
} from './utils/test-db';

const PASSWORD = 'password123';

interface TeamResponseBody {
  team: { id: string; name: string; role: string };
}

interface ErrorResponseBody {
  message: string;
}

// `POST /teams` is the step registration now hands off to once a coach has
// signed in — it used to be bundled straight into sign-up, but team
// creation moved out on its own so `AddTeamModal` on the dashboard can offer
// it to any signed-in coach without a team yet (see `registerCoach` in
// `test/utils/auth-helpers.ts` for how the other suites drive this same
// journey end to end).
describe('Teams (e2e)', () => {
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

  /** Signs up, verifies, and signs in a fresh coach with no team yet. */
  async function signedInCoachWithNoTeam(): Promise<{
    identity: TestIdentity;
    agent: ReturnType<typeof request.agent>;
  }> {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/sign-up')
      .send({ name: 'Test Coach', email: identity.email, password: PASSWORD })
      .expect(201);
    await verifyUserEmail(identity.email);
    await agent
      .post('/auth/sign-in')
      .send({ email: identity.email, password: PASSWORD })
      .expect(201);

    return { identity, agent };
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/teams')
      .send({ name: 'Unauthenticated FC' })
      .expect(401);
  });

  it('creates a team owned by the signed-in coach as its coach', async () => {
    const { identity, agent } = await signedInCoachWithNoTeam();

    const response = await agent
      .post('/teams')
      .send({ name: identity.teamName })
      .expect(201);
    const body = response.body as TeamResponseBody;

    expect(body.team).toMatchObject({ name: identity.teamName, role: 'coach' });

    const session = await agent.get('/auth/session').expect(200);
    expect(
      (session.body as { team: { name: string } | null }).team?.name,
    ).toEqual(identity.teamName);
  });

  it('rejects a payload that fails validation', async () => {
    const { agent } = await signedInCoachWithNoTeam();

    const response = await agent.post('/teams').send({ name: '   ' });

    expect(response.status).toBe(400);
    expect((response.body as ErrorResponseBody).message).toEqual(
      expect.any(String),
    );
  });

  it('rejects a second team for a coach who already has one', async () => {
    const { identity, agent } = await signedInCoachWithNoTeam();

    await agent.post('/teams').send({ name: identity.teamName }).expect(201);

    const response = await agent
      .post('/teams')
      .send({ name: `${identity.teamName} Reserves` });

    expect(response.status).toBe(409);
  });
});
