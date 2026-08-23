import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface AuthResponseBody {
  user: { id: string; name: string; email: string };
  team: { id: string; name: string; role: string } | null;
}

// Per-resource isolation (athletes/events/dashboard scoped by `teamId`) has
// its own coverage in those modules' suites. This one proves the boundary
// underneath all of them: each coach who has completed registration
// (sign-up → verify → sign-in → create a team, via `registerCoach`) gets
// their own distinct team, and `GET /auth/session` never leaks another
// user's.
describe('Team isolation (e2e)', () => {
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

  function newIdentity(): TestIdentity {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    return identity;
  }

  it('gives each newly registered coach a distinct team', async () => {
    const userA = newIdentity();
    const userB = newIdentity();

    const [resultA, resultB] = await Promise.all([
      registerCoach(app.getHttpServer(), userA, 'Coach A'),
      registerCoach(app.getHttpServer(), userB, 'Coach B'),
    ]);

    expect(resultA.team.id).not.toEqual(resultB.team.id);
    expect(resultA.team.name).toEqual(userA.teamName);
    expect(resultB.team.name).toEqual(userB.teamName);
  });

  it("never returns another user's team from /auth/session", async () => {
    const userA = newIdentity();
    const userB = newIdentity();

    const { agent: agentA } = await registerCoach(
      app.getHttpServer(),
      userA,
      'Coach A',
    );
    const { agent: agentB } = await registerCoach(
      app.getHttpServer(),
      userB,
      'Coach B',
    );

    const sessionA = await agentA.get('/auth/session').expect(200);
    const sessionB = await agentB.get('/auth/session').expect(200);
    const bodyA = sessionA.body as AuthResponseBody;
    const bodyB = sessionB.body as AuthResponseBody;

    expect(bodyA.team?.name).toEqual(userA.teamName);
    expect(bodyA.team?.name).not.toEqual(userB.teamName);
    expect(bodyB.team?.name).toEqual(userB.teamName);
    expect(bodyB.team?.name).not.toEqual(userA.teamName);
    expect(bodyA.user.email).toEqual(userA.email);
    expect(bodyB.user.email).toEqual(userB.email);
  });
});
