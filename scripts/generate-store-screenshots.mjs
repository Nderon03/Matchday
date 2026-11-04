// Frames raw phone captures (from `STORE_SHOTS=1 node scripts/e2e-web-visual.mjs`) into 1080x1920
// Play Store screenshots with a caption. Usage: node scripts/generate-store-screenshots.mjs <raw-dir>
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const RAW = process.argv[2];
const OUT = join(process.cwd(), 'assets', 'store', 'screenshots');
const SHOTS = [
  ['home', 'Your football, organised', 'Next game, tasks and form at a glance'],
  ['session', 'Everyone in, one tap', 'RSVPs, waiting list and guests'],
  ['lineup', 'Balanced teams in seconds', 'Drag-and-drop line-ups on the pitch'],
  ['leagues', 'Leaderboards that settle it', 'Goals, ratings and MOTM by group'],
  ['profile', 'Your stats, every game', 'Ratings, form, streaks and achievements'],
  ['payments', 'Get paid without chasing', 'Card, Apple Pay & Google Pay via Stripe'],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [i, [name, title, sub]] of SHOTS.entries()) {
  const img = (await readFile(join(RAW, `${name}.png`))).toString('base64');
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet"></head>
  <body style="margin:0;width:1080px;height:1920px;background:radial-gradient(120% 60% at 50% 0%,#14301f 0%,#0A0C0F 60%);font-family:Inter,Arial,sans-serif;overflow:hidden">
    <div style="text-align:center;padding-top:96px;color:#F5F7FA">
      <div style="font-size:68px;font-weight:800;letter-spacing:-1.5px">${title}</div>
      <div style="font-size:36px;font-weight:500;color:#97A1AE;margin-top:18px">${sub}</div>
    </div>
    <div style="position:absolute;left:50%;top:360px;transform:translateX(-50%);width:720px;height:1480px;border-radius:56px;overflow:hidden;
      box-shadow:0 0 0 10px #1C222B,0 40px 120px rgba(0,0,0,.6);background:#0A0C0F">
      <img src="data:image/png;base64,${img}" style="width:720px;display:block">
    </div>
  </body></html>`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `${String(i + 1).padStart(2, '0')}-${name}.png`) });
}
await browser.close();
console.log(`Saved ${SHOTS.length} screenshots to ${OUT}`);
