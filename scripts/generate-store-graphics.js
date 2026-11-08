// Regenerates the Play Store icon and feature graphic in assets/store (node scripts/generate-store-graphics.js).
const { chromium } = require('playwright');
const path = require('path');
const out = (n) => path.join('/home/user/Matchday/assets/store', n);
const G = '#22C55E', D = '#0A0C0F', W = '#F5F7FA';
const mark = (s = 1, x = 0, y = 0) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M512 270 A242 242 0 0 1 512 754" fill="none" stroke="${G}" stroke-width="64"/>
  <path d="M512 270 A242 242 0 0 0 512 754" fill="none" stroke="${D}" stroke-width="64"/>
  <circle cx="512" cy="512" r="62" fill="${W}"/></g>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${D}"/><rect width="512" height="1024" fill="${G}"/>${mark()}</svg>`;
const fs = require('fs');
const ttf = (f) => fs.readFileSync(path.join(__dirname, '..', 'node_modules/@expo-google-fonts', f)).toString('base64');
const FONTS = `@font-face{font-family:Score;font-weight:800;src:url(data:font/ttf;base64,${ttf('barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf')})}
@font-face{font-family:Inter;font-weight:500;src:url(data:font/ttf;base64,${ttf('inter/500Medium/Inter_500Medium.ttf')})}
@font-face{font-family:Inter;font-weight:800;src:url(data:font/ttf;base64,${ttf('inter/800ExtraBold/Inter_800ExtraBold.ttf')})}`;
// Feature graphic in the MATCHDAY look: floodlit pitch, scoreboard headline, the mark.
const feature = `<html><head><style>${FONTS}
  .beam{position:absolute;top:-60px;width:300px;height:520px;background:linear-gradient(180deg,rgba(220,255,230,.22),rgba(34,197,94,0) 75%);filter:blur(4px)}
</style></head>
<body style="margin:0;width:1024px;height:500px;background:#06140C;font-family:Inter,sans-serif;overflow:hidden;position:relative">
<div style="position:absolute;inset:0;background:radial-gradient(70% 70% at 50% 10%,#1d5a33 0%,#0d2a18 50%,#06140C 85%)"></div>
<div class="beam" style="left:-60px;transform:rotate(-28deg)"></div>
<div class="beam" style="right:-60px;transform:rotate(28deg)"></div>
<div style="position:absolute;left:0;right:0;bottom:0;height:190px;background:repeating-linear-gradient(90deg,#0f3b21 0 64px,#0c331c 64px 128px);opacity:.6;-webkit-mask-image:linear-gradient(180deg,transparent,#000 70%)"></div>
<svg style="position:absolute;left:0;bottom:0" width="1024" height="190"><line x1="0" y1="150" x2="1024" y2="150" stroke="rgba(255,255,255,.12)" stroke-width="2"/><ellipse cx="512" cy="150" rx="150" ry="26" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/></svg>
<div style="position:absolute;left:0;right:0;top:110px;text-align:center">
  <div style="display:inline-flex;align-items:center;gap:12px">
    <svg width="44" height="44" viewBox="0 0 1024 1024" style="border-radius:11px"><rect width="1024" height="1024" fill="${D}"/><rect width="512" height="1024" fill="${G}"/>${mark()}</svg>
    <div style="color:${W};font-weight:800;letter-spacing:7px;font-size:26px">MATCHDAY</div>
  </div>
  <div style="font-family:Score;font-weight:800;font-size:84px;line-height:.95;white-space:nowrap;color:${W};margin-top:26px;letter-spacing:1px">ORGANISE. PLAY. <span style="color:${G}">SETTLE UP.</span></div>
  <div style="font-size:26px;font-weight:500;color:#B6C7BD;margin-top:18px">Invites, fair teams, stats and payments for your weekly game</div>
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  let p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<body style="margin:0">${icon}</body>`);
  await p.screenshot({ path: out('play-icon-512.png'), clip: { x: 0, y: 0, width: 512, height: 512 } });
  p = await b.newPage({ viewport: { width: 1024, height: 500 } });
  await p.setContent(feature); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: out('feature-graphic-1024x500.png'), clip: { x: 0, y: 0, width: 1024, height: 500 } });
  await b.close();
})();
