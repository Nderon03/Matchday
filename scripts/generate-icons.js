// Regenerates the app icons in assets/ from the brand mark (run: node scripts/generate-icons.js). Uses the bundled Playwright Chromium.
const { chromium } = require('playwright');
const G = '#22C55E', D = '#0A0C0F', W = '#F5F7FA';
const mark = (stroke2 = D, spot = W) => `
  <path d="M512 270 A242 242 0 0 1 512 754" fill="none" stroke="${G}" stroke-width="64"/>
  <path d="M512 270 A242 242 0 0 0 512 754" fill="none" stroke="${stroke2}" stroke-width="64"/>
  <circle cx="512" cy="512" r="62" fill="${spot}"/>`;
const split = `<rect width="1024" height="1024" fill="${D}"/><rect width="512" height="1024" fill="${G}"/>`;
const svg = (body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${extra}${body}</svg>`;
const files = [
  ['icon.png', 1024, svg(split + mark()), false],
  ['android-icon-background.png', 512, svg(split), false],
  ['android-icon-foreground.png', 512, svg(mark()), true],
  // themed icons: Android uses the alpha channel only
  ['android-icon-monochrome.png', 432, svg(`<circle cx="512" cy="512" r="242" fill="none" stroke="#fff" stroke-width="64"/><circle cx="512" cy="512" r="62" fill="#fff"/>`), true],
  ['splash-icon.png', 1024, svg(`<g clip-path="url(#c)"><rect width="1024" height="1024" fill="#1A2029"/><rect width="512" height="1024" fill="${G}"/></g>` + mark('#1A2029'), '<defs><clipPath id="c"><circle cx="512" cy="512" r="440"/></clipPath></defs>'), true],
  ['favicon.png', 48, svg(`<g clip-path="url(#r)">${split}${mark()}</g>`, '<defs><clipPath id="r"><rect width="1024" height="1024" rx="220"/></clipPath></defs>'), true],
];
(async () => {
  const b = await chromium.launch();
  for (const [name, size, s, transparent] of files) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`);
    await p.screenshot({ path: require('path').join(__dirname, '..', 'assets', name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
  }
  await b.close();
})();
