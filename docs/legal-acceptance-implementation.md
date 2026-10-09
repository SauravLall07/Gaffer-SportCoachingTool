# Gaffer legal acceptance implementation

Implemented and verified on 9 October 2026.

## 1. Files created and modified

Created:

| File | Purpose |
| --- | --- |
| `backend/src/auth/legal-acceptance.ts` | Better Auth request/database hooks and atomic user/acceptance adapter wrapper. |
| `backend/drizzle/0064_legal_acceptance.sql` | Add the dedicated acceptance table. |
| `backend/test/legal-acceptance.integration-test.ts` | Real Better Auth lifecycle tests against local PostgreSQL (PGlite). |
| `backend/test/jest-legal.json` | Native ESM configuration for the focused lifecycle tests. |
| `docs/legal-acceptance-implementation.md` | This implementation and deployment report. |

Modified:

| File | Purpose |
| --- | --- |
| `backend/src/database/schema/index.ts` | Drizzle definition of `legal_acceptance`. |
| `backend/drizzle/meta/_journal.json` | Register migration 0064 in the existing migration workflow. |
| `backend/src/auth/auth.ts` | Connect acceptance hooks and the wrapped Drizzle adapter to the existing Better Auth instance. |
| `backend/src/auth/auth.schemas.ts` | Require literal `true` for email signup; support player claim verification return paths. |
| `backend/src/auth/auth.controller.ts` | Forward the validated checkbox value to Better Auth; preserve claim verification redirects. |
| `backend/src/auth/auth.controller.spec.ts` | Test Nest validation and claim redirects; update successful signup fixtures. |
| `backend/test/auth.e2e-spec.ts` | Include explicit acceptance in existing signup requests. |
| `backend/test/utils/auth-helpers.ts` | Include acceptance in shared registration fixtures. |
| `backend/scripts/migration-plan.test.mjs` | Verify prepared execution and one-time recording of migration 0064. |
| `backend/package.json` | Add `test:legal`. |
| `frontend/src/context/auth-context.ts` | Type the acceptance field and Google signup argument; support claim redirects. |
| `frontend/src/context/AuthContext.tsx` | Forward Google checkbox state, preserve signup retry context, and surface OAuth initiation errors. |
| `frontend/src/pages/SignUpPage.tsx` | Send the existing checkbox state for both signup methods; preserve invite/claim return paths and pending invitation recovery. |
| `frontend/src/pages/JoinTeamPage.tsx` | Route new registration through the existing signup page; retain inline sign-in and invitation confirmation. |
| `frontend/src/pages/JoinCompetitionPage.tsx` | Route new registration through the existing signup page; retain sign-in and team verification. |
| `frontend/src/pages/ClaimPage.tsx` | Route new registration through the existing signup page; retain the separate player/guardian consent confirmation. |
| `frontend/src/pages/LoginPage.tsx` | Redirect a new Google user rejected for missing legal acceptance to signup. |
| `frontend/src/pages/VerifyEmailPendingPage.tsx` | Preserve claim return paths on verification resend/retry. |
| `frontend/e2e/utils/auth.ts` | Include acceptance in browser-test API registration fixtures. |

The signup page's checkbox markup, wording and styling are unchanged. Terms and Privacy document contents are unchanged. Invitation and claim registration use the existing signup page as requested; their duplicate registration forms were removed.

## 2. Database additions

Only the new `legal_acceptance` table is added:

| Column | PostgreSQL type | Rules |
| --- | --- | --- |
| `user_id` | `text` | Required; foreign key to Better Auth's `user.id`, with cascade on user deletion. |
| `terms_version` | `text` | Required; selected by the backend. |
| `privacy_version` | `text` | Required; selected by the backend. |
| `accepted_at` | `timestamp with time zone` | Required; PostgreSQL `DEFAULT now()`. |
| `method` | `text` | Required; constrained to `email_signup` or `google_signup`. |

The primary key is `(user_id, terms_version, privacy_version)`, preventing duplicate records for the same user/document versions. Both current version identifiers are `2026-10-05`, matching the existing documents' effective dates. No historical acceptance is invented for existing users.

## 3. Migration commands

From the repository root in Windows PowerShell:

```powershell
cd backend
npm.cmd run db:migrate -- --dry-run
npm.cmd run db:migrate
```

Migration 0064 uses the repository's existing SQL-and-journal Drizzle workflow. It is already authored; generating another migration is unnecessary. The migration was executed against local PostgreSQL in tests, including the production runner's prepared-statement and journal behavior. No live database migration was applied during this implementation.

## 4. Email signup persistence

The existing `termsAccepted` state is sent to `POST /auth/sign-up`. Nest's Zod schema requires the boolean literal `true`; missing, false, string and numeric substitutes are rejected before Better Auth is called. Better Auth's `/sign-up/email` hook and user-creation hook enforce the same requirement, so using its API directly cannot bypass the Nest validation.

The user-creation hook supplies a private Symbol containing server-selected versions and the signup method. JSON requests cannot supply that Symbol. The adapter wrapper consumes it and inserts the actual Better Auth user ID and acceptance together using Drizzle's Neon HTTP batch. PostgreSQL generates the timestamp. Client-supplied versions, timestamps and method values are ignored.

[Drizzle's batch API](https://orm.drizzle.team/docs/batch-api) executes the user and acceptance inserts atomically with the Neon driver. An acceptance insert failure rolls back the user insert before Better Auth can create an account, send a verification email or issue a session. All other adapter operations remain delegated to the existing Drizzle adapter. The wrapper also preserves its create override inside Better Auth's transaction context, including the driver's fallback for unsupported interactive transactions.

Email verification, passwords, sessions, Google account linking and existing identity validation remain under the existing Better Auth configuration.

## 5. Google signup

The existing checkbox value is passed in the social initiation request. The backend checks that it is strictly `true` and uses Better Auth 1.7.7's [`addOAuthServerContext`](https://better-auth.com/docs/concepts/oauth#passing-server-trusted-data) to attach server-selected versions and method to protected OAuth state. Client-provided `serverContext` or acceptance metadata cannot populate that server-only slot.

During `/callback/google`, the user-creation hook reads `getOAuthState().serverContext` only after Better Auth verifies and consumes the redirect state. Callback query flags and browser storage are not evidence of acceptance. Missing consent prevents user creation and session issuance. A user can check the signup checkbox and retry the redirect. New Google users who begin from the login page are sent to the same signup page when the server reports `LEGAL_ACCEPTANCE_REQUIRED`.

Returning Google users do not run the user-creation hook and can sign in without checking the box again. This also preserves login for legacy accounts without acceptance rows. Google ID-token registration does not provide the supported verified acceptance redirect and is rejected for new users; existing-user authentication remains available.

For invited users, the original team, competition or claim link is carried through signup, verification and the Google return path. The browser's stored return path controls navigation only. It never authorizes acceptance or access. New player accounts still confirm the separate player/guardian consent on the claim page.

## 6. Verification results

Final backend verification used the lockfile's Better Auth **1.7.7**, installed with `npm ci`; package manifests and lockfile dependency versions were not changed.

| Check | Result |
| --- | --- |
| `npm.cmd run test:legal` in `backend` | 17 passed. |
| Backend auth controller, auth guard, auth service and database migration suites | 53 passed across 4 suites. |
| `npm.cmd run test:migrations` in `backend` | 14 passed, including migration 0064 prepared execution and one-time journal recording. |
| `npm.cmd run test` in `frontend` | 133 passed. |
| Backend and frontend production builds | Passed. |
| ESLint on changed backend TypeScript; frontend lint | Passed. |
| `git diff --check` | Passed. |
| Source comparison of the signup checkbox markup | Unchanged. |

The focused lifecycle suite covers all eight requested scenarios: successful email acceptance; rejected missing/false email consent; successful Google acceptance; blocked Google registration without consent and successful retry; direct API rejection; database rollback for both signup methods; existing email/Google login; and duplicate prevention. Additional coverage includes wrong-type consent values, forged document metadata, forged OAuth server context, callback flags, tampered/replayed OAuth state, direct Google ID-token signup, user foreign keys and deletion cleanup.

Google's remote endpoints are stubbed in these tests. Better Auth's request handling, state validation, hooks, adapter operations, sessions and local PostgreSQL persistence run for real. Tests do not contact a real Google account, send real emails or modify a live database. The frontend build retains its existing large-chunk warning.

To repeat the backend regression selection:

```powershell
cd backend
npm.cmd run test:legal
npm.cmd run test -- --runInBand src/auth/auth.controller.spec.ts src/auth/auth.guard.spec.ts src/auth/auth.service.spec.ts src/database/migrations.spec.ts
npm.cmd run test:migrations
npm.cmd run build
```

## 7. Deployment requirements

No new environment variables, OAuth redirect URI changes or dependencies are required. Existing database, Better Auth, frontend URL and Google provider settings continue to apply.

Apply migration 0064 before deploying the backend. Deploy the updated frontend with it so signup requests include the required checkbox value; older clients that omit it will be rejected. Use the committed backend lockfile, which already specifies Better Auth 1.7.7. Future legal document releases should deliberately update the backend version constants; this change enforces acceptance at registration and does not introduce a reacceptance requirement for existing users.
