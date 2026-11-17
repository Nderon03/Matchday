// Body of the hostile-data check (see e2e-web-hostile.sh); appended to the visual test's fake-server setup.
const mode = process.env.MODE;
const keep = { profiles: table.profiles }; // still signed in as someone
if (mode === 'empty') {
  for (const k of Object.keys(table)) if (!(k in keep)) table[k] = [];
  for (const k of Object.keys(rpcs)) delete rpcs[k];
} else {
  // blank a third of every object's fields, deterministically
  let seed = Number(process.env.SEED ?? 7); const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const holes = (v, depth = 0) => {
    if (Array.isArray(v)) return v.map((x) => holes(x, depth + 1));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = (depth > 0 && k !== 'id' && rnd() < 0.33) ? null : holes(x, depth + 1); return o; }
    return v;
  };
  for (const k of Object.keys(table)) if (k !== 'profiles') table[k] = holes(table[k]);
  for (const k of Object.keys(rpcs)) rpcs[k] = holes(rpcs[k]);
}
const { page, errors } = await openPage({ width: 390, height: 844 });
const bad = [];
for (const r of FIT_ROUTES) {
  errors.length = 0;
  await page.goto(base + r, { waitUntil: 'load' }).catch(() => undefined); await page.waitForTimeout(1300);
  const t = await page.locator('body').innerText().catch(() => '');
  if (/Something went wrong\n/.test(t) && /Try again/.test(t) && /Go home/.test(t)) bad.push(`${r} :: ${t.split('\n').slice(1, 3).join(' | ')}`);
  else if (errors.length) bad.push(`${r} :: pageerror ${errors[0].slice(0, 160)}`);
}
console.log(`${mode}${mode === 'holes' ? ` seed ${process.env.SEED ?? 7}` : ''}: ${bad.length} broken`); for (const b of bad) console.log('  ' + b);
await browser.close(); process.exit(bad.length ? 1 : 0);
