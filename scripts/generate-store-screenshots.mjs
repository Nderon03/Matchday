// Frames raw phone captures (from `STORE_SHOTS=1 node scripts/e2e-web-visual.mjs`) into 1080x1920
// Play Store screenshots in the MATCHDAY look. Usage: node scripts/generate-store-screenshots.mjs <raw-dir>
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const RAW = process.argv[2];
const OUT = join(process.cwd(), 'assets', 'store', 'screenshots');
const SHOTS = [
  ['home', 'Matchday mode', "IT'S GAME DAY", 'The countdown to kick-off, right on your home screen'],
  ['session', 'Everyone in', 'ONE TAP', 'Invites, waiting list, guests and the forecast'],
  ['lineup', 'Fair teams', 'IN SECONDS', 'Balanced from ratings and form. Drag to tweak'],
  ['profile', 'Your player card', 'LEVELS UP', 'Ratings, stats, titles, medals and reliability'],
  ['achievements', 'Bronze to', 'HALL OF FAME', 'Medals, new card styles and head-to-heads'],
  ['group', 'Dream Team', 'OF THE MONTH', 'The best five in your group, ready to share'],
  ['payments', 'Settle up', 'NO CHASING', 'Card, Apple Pay & Google Pay via Stripe'],
];

const font = (f) => `node_modules/@expo-google-fonts/${f}`;
const b64 = async (path) => (await readFile(join(process.cwd(), path))).toString('base64');
const FONTS = `
  @font-face{font-family:Score;font-weight:800;src:url(data:font/ttf;base64,${await b64(font('barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf'))})}
  @font-face{font-family:Score;font-weight:700;src:url(data:font/ttf;base64,${await b64(font('barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'))})}
  @font-face{font-family:Inter;font-weight:500;src:url(data:font/ttf;base64,${await b64(font('inter/500Medium/Inter_500Medium.ttf'))})}
  @font-face{font-family:Inter;font-weight:800;src:url(data:font/ttf;base64,${await b64(font('inter/800ExtraBold/Inter_800ExtraBold.ttf'))})}`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [i, [name, title, kicker, sub]] of SHOTS.entries()) {
  const img = (await readFile(join(RAW, `${name}.png`))).toString('base64');
  await page.setContent(`<html><head><style>${FONTS}
    body{margin:0;width:1080px;height:1920px;overflow:hidden;font-family:Inter,sans-serif;background:#06140C;position:relative}
    .beam{position:absolute;top:-80px;width:520px;height:1100px;background:linear-gradient(180deg,rgba(220,255,230,.20),rgba(34,197,94,0) 75%);filter:blur(6px)}
  </style></head><body>
    <div style="position:absolute;inset:0;background:radial-gradient(90% 45% at 50% 18%,#1d5a33 0%,#0d2a18 45%,#06140C 75%)"></div>
    <div class="beam" style="left:-160px;transform:rotate(-24deg)"></div>
    <div class="beam" style="right:-160px;transform:rotate(24deg)"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:640px;background:repeating-linear-gradient(90deg,#0f3b21 0 90px,#0c331c 90px 180px);opacity:.55;
      -webkit-mask-image:linear-gradient(180deg,transparent,#000 60%)"></div>
    <div style="position:relative;text-align:center;padding-top:70px">
      <div style="display:inline-flex;align-items:center;gap:14px">
        <svg width="48" height="48" viewBox="0 0 1024 1024" style="border-radius:13px"><rect width="1024" height="1024" fill="#0A0C0F"/><rect width="512" height="1024" fill="#22C55E"/>
          <path d="M512 270 A242 242 0 0 1 512 754" fill="none" stroke="#22C55E" stroke-width="64"/><path d="M512 270 A242 242 0 0 0 512 754" fill="none" stroke="#0A0C0F" stroke-width="64"/><circle cx="512" cy="512" r="62" fill="#F5F7FA"/></svg>
        <div style="color:#F4F6F8;font-weight:800;letter-spacing:7px;font-size:30px">MATCHDAY</div>
      </div>
      <div style="font-family:Score;font-weight:800;font-size:112px;line-height:.95;color:#F4F6F8;text-transform:uppercase;margin-top:34px;letter-spacing:1px">${title}<br><span style="color:#22C55E">${kicker}</span></div>
      <div style="font-size:34px;font-weight:500;color:#B6C7BD;margin-top:22px">${sub}</div>
    </div>
    <div style="position:absolute;left:50%;top:520px;transform:translateX(-50%);width:700px;height:1520px;border-radius:60px;overflow:hidden;
      box-shadow:0 0 0 10px #10241a,0 0 0 12px rgba(34,197,94,.35),0 40px 140px rgba(0,0,0,.7);background:#0A0C0F">
      <img src="data:image/png;base64,${img}" style="width:700px;display:block">
    </div>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${String(i + 1).padStart(2, '0')}-${name}.png`) });
}
await browser.close();
