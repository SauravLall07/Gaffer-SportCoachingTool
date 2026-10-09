# SEC-009: browser security headers

## Production inspection before changes

On 9 October 2026 at 12:13 SAST (10:13 UTC), read-only GET requests inspected
the existing deployments. These observations describe the deployment before
this branch, not proof that the new configuration has been deployed.

| Request | Status | CSP / frame protection / nosniff / Referrer-Policy | HSTS |
| --- | --- | --- | --- |
| `https://gaffer-virid.vercel.app/` | 200 HTML | All absent | `max-age=63072000; includeSubDomains; preload` |
| `https://gaffer-api-ynaf.onrender.com/v1/formations` | 200 JSON | All absent | Absent |
| `http://gaffer-virid.vercel.app/` | 308 | Redirects to the same path on HTTPS | N/A |
| `http://gaffer-api-ynaf.onrender.com/v1/formations` | 301 | Redirects to the same path on HTTPS | N/A |

Inspect with GET rather than assuming HEAD has identical middleware:

```sh
curl -sS -D - -o /dev/null https://gaffer-virid.vercel.app/
curl -sS -D - -o /dev/null https://gaffer-api-ynaf.onrender.com/v1/formations
curl -sS -D - -o /dev/null http://gaffer-virid.vercel.app/
curl -sS -D - -o /dev/null http://gaffer-api-ynaf.onrender.com/v1/formations
```

On Windows, use `curl.exe` and replace `/dev/null` with `NUL`.

## Configuration and compatibility

Both `vercel.json` deployment roots apply an enforcing CSP and the following
headers to every route, including static assets, SPA deep links and rewrites:

- `frame-ancestors 'none'` plus `X-Frame-Options: DENY` prevents framing Gaffer.
- `X-Content-Type-Options: nosniff` disables MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` keeps same-origin referrers,
  sends only the origin externally, and omits referrers on HTTPS downgrades.

Nest installs `configureSecurityHeaders` before Swagger, auth handlers, CORS
and routing. Direct Render API/auth responses, redirects and errors get these
headers too; Express's `X-Powered-By` is removed. There is no Render blueprint
in the repository. The application middleware supplies the Render policy
without an unverified dashboard change.

The frontend defaults to same-origin resources, blocks objects, restricts
base URLs and forms, and permits no inline JavaScript or JavaScript `eval`.
The three theme/preloader scripts now load from same-origin public files,
preserving their original execution order. Inline styles remain necessary for
React layout, charts, animations and the preloader.

| Integration | CSP support and scope |
| --- | --- |
| Better Auth / API | Same-origin `/auth` and `/api` requests preserve the existing Vercel rewrites and first-party cookies. |
| Google OAuth | Top-level navigation to Google remains allowed; `form-action` also permits `https://accounts.google.com`. No Google script or iframe allowance is needed for the current redirect flow. |
| Google avatars | HTTPS images from `*.googleusercontent.com`. |
| Google Fonts | CSS from `fonts.googleapis.com`, fonts from `fonts.gstatic.com`; both also allowed in `connect-src` for service-worker font caching. |
| Maps | Images and service-worker requests to `tile.openstreetmap.org`; the existing OpenStreetMap embed URL is permitted in `frame-src`. Google Maps directions use external links. |
| PowerSync | HTTPS/WSS to the configured Cloud instance `6aac1ed7a77ca1231d28f82d.powersync.journeyapps.com`, same-origin/blob workers, blob fetches, and `wasm-unsafe-eval` for SQLite. JavaScript `unsafe-eval` stays blocked. |
| CSV / PDF | Blob downloads and same-origin lazy imports for jsPDF. Downloads are not restricted by resource-fetch directives. |
| Direct Render connections | The known Render HTTPS/WSS origin is allowed for backend connections. |
| Gemini / Brevo / Neon / weather / geocoding | Called by the backend; document CSP does not restrict server-side requests. No browser-wide provider allowances are added. |

When changing PowerSync hosts, update HTTPS **and** WSS origins in both Vercel
files before rollout, including endpoints returned by `/sync/token`. A custom
or regional endpoint needs its own explicit entry. Avoid broad `https:`/`wss:`
or provider-wide wildcards. Existing local Vite development remains unrestricted
for HMR and local API overrides; production preview reads the actual Vercel
headers so browser regression tests exercise the enforcing policy.

HSTS was considered after confirming redirects on the two known platform
hosts. Vercel already supplies HSTS, so the application does not override it.
Render HSTS is deferred: these probes do not establish all custom hosts,
subdomains or local HTTP environments are HTTPS-only. Confirm those before
adding a long-lived policy or opting into `includeSubDomains`/preload.

## Validation and deployment acceptance

Local verification on this branch:

- Frontend and backend production builds pass.
- Frontend lint and ESLint on changed backend files pass.
- `npm --prefix frontend test`: 129 tests pass, including map URL/tile models,
  CSV generation and PDF generation.
- `npm --prefix backend test -- --runInBand security-headers.spec.ts swagger-config.spec.ts cors-config.spec.ts auth.controller.spec.ts`:
  59 tests pass, including security headers on JSON, redirects, 404s and CORS
  preflight, cookie preservation, Swagger assets and auth controller behavior.
- `UI_TEST_PRODUCTION=true npm run test:e2e:security` after the frontend build:
  all 5 tests pass. The suite tests the production CSP in Chromium, deliberate
  inline script blocking, Better Auth's Google OAuth initiation with mocked
  provider responses, map tiles and PowerSync transport/browser primitives
  with mocked external responses, real CSV/PDF downloads from the reporting
  UI, and PWA service-worker installation/offline reopening.
  Omit `UI_TEST_PRODUCTION` to build automatically; in PowerShell set it with
  `$env:UI_TEST_PRODUCTION='true'` and use `npm.cmd` if script execution is disabled.
- `npx playwright test --config playwright.offline.config.ts --project desktop-chromium --grep 'all live event workflows|an offline goal uploads'`:
  both existing regressions pass with the production CSP, exercising actual
  SQLite/PowerSync local storage and a queued goal uploading to a mocked API
  after reconnecting.

The first pointer-driven export check exposed an existing statistics content
layer overlapping the export dropdown. The CSP regression uses keyboard
activation of the real menu items and validates downloaded CSV/PDF contents;
the unrelated pointer overlap is not fixed by SEC-009.

No database or production account writes were used. OAuth provider completion,
real remote PowerSync authorization/replication and server-side external
services are not established by mocked browser responses or unit tests.

After deploying both frontend and backend, complete these checks before
closing SEC-009:

- [ ] Repeat GET header inspection on the Vercel root/deep links/assets,
  proxied API/auth endpoints, and direct Render API/auth/Swagger/error routes.
  Check for duplicate CSPs from the rewrite origin: browsers enforce every
  policy, so one permissive policy cannot relax another restrictive policy.
- [ ] Complete a real Google sign-in and callback, refresh the Better Auth
  session, then sign out, using an approved test account.
- [ ] Install/update the PWA, reopen offline, and reconnect with queued match
  events. Verify real SQLite workers and PowerSync HTTPS/WSS connections.
- [ ] Open an event map, confirm tiles and fonts load, and follow directions.
- [ ] Export CSV/PDF from populated statistics, match, injury and game-plan
  reports; inspect contents and images.
- [ ] Verify weather/location search, email flows and Gemini insights through
  approved test fixtures; check API and external service errors separately.
- [ ] Monitor the browser console/network and confirm required resources have
  no CSP violations, including an installed PWA after its cached shell updates.

References: [Vercel response headers](https://vercel.com/docs/headers/response-headers),
[Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json),
[CSP script/WebAssembly directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).
