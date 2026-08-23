import request from 'supertest';
import type { App } from 'supertest/types';
import type { TestIdentity } from './test-db';
import { verifyUserEmail } from './test-db';

export interface SessionUserBody {
  id: string;
  name: string;
  email: string;
}

export interface SessionTeamBody {
  id: string;
  name: string;
  role: string;
}

export interface AuthResponseBody {
  user: SessionUserBody;
  team: SessionTeamBody | null;
}

const PASSWORD = 'password123';

/**
 * Signs up a fresh coach, verifies their email, signs them in, and gives
 * them a team — then returns an authenticated Supertest agent (the session
 * cookie persists across every call made through it) plus the user/team
 * `TeamsService` created for them. Shared by the resource-level
 * (athletes/events/dashboard) integration suites so each test gets its own
 * isolated team without repeating this boilerplate.
 *
 * Three calls, not one, because none of this collapses into sign-up
 * anymore: `requireEmailVerification` (`src/auth/auth.ts`) withholds the
 * session until the address is confirmed, and team creation moved out of
 * sign-up entirely into its own `POST /teams` step the frontend drives from
 * the dashboard's "Add Team" flow (see `AddTeamModal.tsx`). There's no inbox
 * for these tests to read the verification link from, so `verifyUserEmail`
 * flips `emailVerified` straight in the database instead — the same
 * shortcut `cleanupUser` takes to tear down through the DB rather than the
 * API.
 */
export async function registerCoach(
  server: App,
  identity: TestIdentity,
  name = 'Test Coach',
): Promise<{
  agent: ReturnType<typeof request.agent>;
  user: SessionUserBody;
  team: SessionTeamBody;
}> {
  const agent = request.agent(server);

  await agent
    .post('/auth/sign-up')
    .send({ name, email: identity.email, password: PASSWORD })
    .expect(201);

  await verifyUserEmail(identity.email);

  const signInResponse = await agent
    .post('/auth/sign-in')
    .send({ email: identity.email, password: PASSWORD })
    .expect(201);

  const teamResponse = await agent
    .post('/teams')
    .send({ name: identity.teamName })
    .expect(201);

  return {
    agent,
    user: (signInResponse.body as { user: SessionUserBody }).user,
    team: (teamResponse.body as { team: SessionTeamBody }).team,
  };
}
