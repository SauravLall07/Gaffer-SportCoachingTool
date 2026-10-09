import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Service-worker lifecycle is covered separately by pwa-production.spec.ts;
// disable it here so intercepted API/provider fixtures always reach routing.
test.use({ serviceWorkers: 'block' });

function observeCsp(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (/content security policy|violates.*directive/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

test('both deployment roots agree and the browser blocks injected scripts', async ({ page }) => {
  const root = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const frontend = JSON.parse(readFileSync('frontend/vercel.json', 'utf8'));
  expect(root).toEqual(frontend);
  await page.route('**/auth/session', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  const response = await page.goto('/login');
  const headers = response!.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['content-security-policy']).not.toContain("'unsafe-eval'");
  expect(headers['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', event => violations.push(event.effectiveDirective));
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "yes"';
    document.body.append(script);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { injected: document.documentElement.dataset.injected, violations };
  });
  expect(result.injected).toBeUndefined();
  expect(result.violations).toContain('script-src-elem');
});

test('Better Auth starts Google OAuth using the same-origin endpoint', async ({ page }) => {
  const errors = observeCsp(page);
  await page.route('**/auth/session', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  let payload: Record<string, unknown> | undefined;
  await page.route('**/auth/sign-in/social', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { url: 'https://accounts.google.com/o/oauth2/v2/auth?fixture=sec009', redirect: true } });
  });
  await page.route('https://accounts.google.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<h1>Google OAuth destination fixture</h1>',
  }));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page).toHaveURL(/accounts\.google\.com/);
  expect(payload?.provider).toBe('google');
  expect(payload?.callbackURL).toBe('http://127.0.0.1:4173/oauth/callback');
  expect(errors).toEqual([]);
});

test('map tiles, PowerSync connections, workers and WebAssembly are allowed', async ({ page }) => {
  const errors = observeCsp(page);
  await page.route('**/auth/session', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    contentType: 'image/png', body: readFileSync('frontend/public/favicon-32x32.png'),
  }));
  await page.route('https://6aac1ed7a77ca1231d28f82d.powersync.journeyapps.com/**', route => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' }, json: { fixture: true },
  }));
  await page.goto('/login');
  const resources = await page.evaluate(async () => {
    const tile = new Image();
    tile.src = 'https://tile.openstreetmap.org/15/1/1.png';
    await tile.decode();
    // Exercise the same browser primitives used by the PowerSync SDK.
    await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const workerUrl = URL.createObjectURL(new Blob(['postMessage("ready")'], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const message = await new Promise(resolve => { worker.onmessage = event => resolve(event.data); });
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    const sync = await fetch('https://6aac1ed7a77ca1231d28f82d.powersync.journeyapps.com/');
    return { tileWidth: tile.naturalWidth, worker: message, sync: sync.ok };
  });
  expect(resources).toEqual({ tileWidth: 32, worker: 'ready', sync: true });
  expect(errors).toEqual([]);
});

test('real reporting UI downloads CSV and PDF under the production CSP', async ({ page }) => {
  const errors = observeCsp(page);
  await page.route('**/auth/session', route => route.fulfill({ json: {
    user: { id: 'security-coach', name: 'Security Coach', email: 'security@example.com', emailVerified: true, image: null },
    team: { id: 'security-team', name: 'Security FC', role: 'coach', primaryColor: '#00D99A' },
    claimedAthletes: [],
  } }));
  const overview = {
    matchesPlayed: 0, wins: 0, draws: 0, losses: 0, winRate: 0, goalsFor: 0,
    goalsAgainst: 0, goalDifference: 0, cleanSheets: 0, points: 0, avgGoalsFor: 0,
    avgGoalsAgainst: 0, recentInsights: [],
    trends: [], players: [], season: null, rollingWindow: 5,
    form: { rolling: [], cumulative: [] }, periods: { mode: 'halves', splits: [], deltas: [] },
  };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/statistics' ? overview
      : path === '/api/statistics/season-insight' ? { status: 'unavailable', narrativeText: null, generatedAt: null, failureReason: null }
      : [];
    return route.fulfill({ json });
  });
  await page.goto('/statistics');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  for (const format of ['CSV', 'PDF']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const downloading = page.waitForEvent('download');
    // Keyboard activation also avoids the existing statistics content layer
    // overlapping the dropdown; this regression targets CSP/export behavior.
    await page.getByRole('menuitem', { name: `Export ${format}` }).press('Enter');
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
    expect(await download.failure()).toBeNull();
    const content = readFileSync((await download.path())!);
    if (format === 'PDF') expect(content.subarray(0, 5).toString()).toBe('%PDF-');
    else expect(content.toString()).toContain('Security FC');
  }
  expect(errors).toEqual([]);
});
