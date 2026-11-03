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
const feature = `<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;width:1024px;height:500px;background:${D};font-family:Inter,Arial,sans-serif;overflow:hidden">
<div style="position:absolute;left:0;top:0;width:500px;height:500px;overflow:hidden">
  <svg width="500" height="500" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${D}"/><rect width="512" height="1024" fill="${G}"/>${mark()}</svg>
</div>
<div style="position:absolute;left:560px;top:150px;color:${W}">
  <div style="font-size:72px;font-weight:800;letter-spacing:-2px">MATCHDAY</div>
  <div style="font-size:30px;font-weight:500;color:#97A1AE;margin-top:10px;line-height:1.3">Organise your football.<br>Line-ups, stats &amp; payments.</div>
  <div style="width:80px;height:6px;background:${G};border-radius:3px;margin-top:28px"></div>
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  let p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<body style="margin:0">${icon}</body>`);
  await p.screenshot({ path: out('play-icon-512.png'), clip: { x: 0, y: 0, width: 512, height: 512 } });
  p = await b.newPage({ viewport: { width: 1024, height: 500 } });
  await p.setContent(feature); await p.waitForTimeout(1500);
  await p.screenshot({ path: out('feature-graphic-1024x500.png'), clip: { x: 0, y: 0, width: 1024, height: 500 } });
  await b.close();
})();
