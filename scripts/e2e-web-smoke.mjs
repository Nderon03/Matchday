// Web smoke test: serves the exported web build, renders the public screens at phone
// and desktop sizes in Chromium, fails on runtime errors and saves screenshots.
// Usage: EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo export -p web && node scripts/e2e-web-smoke.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIST = join(process.cwd(), 'dist');
const OUT = process.env.SCREENSHOT_DIR ?? join(process.cwd(), 'e2e-screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const file = await readFile(join(DIST, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(await readFile(join(DIST, 'index.html'))); // SPA fallback
  }
}).listen(0);
const base = `http://localhost:${server.address().port}`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const failures = [];
const viewports = { phone: { width: 375, height: 812 }, desktop: { width: 1366, height: 900 } };
const routes = [
  ['welcome', '/welcome', 'MATCHDAY'],
  ['sign-in', '/sign-in', 'Ready for kick-off?'],
  ['sign-up', '/sign-up', 'Join the squad.'],
  ['forgot', '/forgot-password', 'Reset your password.'],
  ['home-redirect', '/', 'MATCHDAY'],
  ['not-found', '/this-does-not-exist', 'Page not found'],
];
for (const [vpName, vp] of Object.entries(viewports)) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|net::/i.test(m.text()) && errors.push(m.text()));
  // the backend is not reachable in this smoke test; make auth calls fail fast
  await page.route(/supabase\.co|example\.supabase/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  for (const [name, path, expected] of routes) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const text = await page.locator('body').innerText();
    if (!text.toLowerCase().includes(expected.toLowerCase())) failures.push(`${vpName} ${path}: expected "${expected}"`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollW > vp.width + 1) failures.push(`${vpName} ${path}: horizontal overflow (${scrollW}px)`);
    await page.screenshot({ path: join(OUT, `${vpName}-${name}.png`), fullPage: true });
  }
  // focused text field (thin green border, no browser outline)
  await page.goto(base + '/sign-in', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').first().click();
  await page.keyboard.type('sam@example.com');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  if (outline !== 'none') failures.push(`${vpName}: focused input still shows a browser outline (${outline})`);
  await page.screenshot({ path: join(OUT, `${vpName}-input-focus.png`) });
  // client-side validation on sign-up
  // sign-up is two steps: who you are, then your login
  await page.goto(base + '/sign-up', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForTimeout(200);
  if (!/Required/.test(await page.locator('body').innerText())) failures.push(`${vpName}: sign-up step 1 validation missing`);
  await page.getByLabel('Your name').first().fill('Sam Carter');
  await page.getByLabel('Username').first().fill('samcarter');
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForTimeout(700);
  if (!/Nice one, Sam\./.test(await page.locator('body').innerText())) failures.push(`${vpName}: sign-up step 2 not reached`);
  await page.getByLabel('Password').first().fill('football123');
  await page.waitForTimeout(200);
  if (!/Good|Strong/.test(await page.locator('body').innerText())) failures.push(`${vpName}: password strength missing`);
  await page.screenshot({ path: join(OUT, `${vpName}-sign-up-step2.png`) });
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForTimeout(200);
  if (!(await page.locator('body').innerText()).includes('Enter a valid email address')) failures.push(`${vpName}: sign-up validation message missing`);
  if (errors.length) failures.push(`${vpName}: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
}
await browser.close();
server.close();
if (failures.length) {
  console.error('Web smoke test FAILED:\n' + failures.join('\n'));
  process.exit(1);
}
console.log(`Web smoke test passed. Screenshots in ${OUT}`);
