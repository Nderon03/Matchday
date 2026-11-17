// Body of the compactness check (see e2e-web-heights.sh): every screen's content height at phone and
// desktop width, written to HEIGHTS_OUT; with HEIGHTS_BASE, fails if any screen grew.
/* global openPage, FIT_ROUTES, base, browser */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1366, height: 900 } };
const out = {};
for (const [name, vp] of Object.entries(sizes)) {
  const { page } = await openPage(vp);
  for (const r of FIT_ROUTES) {
    await page.goto(base + r, { waitUntil: 'load' }).catch(() => undefined);
    await page.waitForTimeout(1300);
    { const ok = page.getByRole('button', { name: 'OK' }); if (await ok.count()) { await ok.last().click().catch(() => undefined); await page.waitForTimeout(400); } }
    // the tallest scrolling area on the page = how much there is to scroll through
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight,
      ...[...document.querySelectorAll('div')].filter((d) => { const s = getComputedStyle(d); return /(auto|scroll)/.test(s.overflowY) && d.scrollHeight > d.clientHeight + 4; }).map((d) => d.scrollHeight)));
    out[`${name} ${r}`] = h;
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}${r.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: false });
  }
  await page.close();
}
writeFileSync(process.env.HEIGHTS_OUT ?? 'heights.json', JSON.stringify(out, null, 1));
let grew = 0;
if (process.env.HEIGHTS_BASE && existsSync(process.env.HEIGHTS_BASE)) {
  const before = JSON.parse(readFileSync(process.env.HEIGHTS_BASE, 'utf8'));
  for (const [k, v] of Object.entries(out)) {
    const b = before[k]; if (!b) continue;
    const d = v - b;
    if (d > 8) { grew++; console.log(`GREW  ${k}: ${b} -> ${v} (+${d})`); }
    else if (d < -8) console.log(`less  ${k}: ${b} -> ${v} (${d})`);
  }
  console.log(grew ? `${grew} screens got taller` : 'no screen got taller');
}
await browser.close(); process.exit(grew ? 1 : 0);
