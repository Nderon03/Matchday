/**
 * Readable colour text. The app's bright accents (avatar colours, medal tiers, season badges) look
 * great on the dark theme but fade into white backgrounds, so on the light theme they're darkened
 * just enough to reach WCAG AA (4.5:1) against what they sit on. The dark theme is left untouched.
 */
type RGB = [number, number, number];

function parse(hex: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
function luminance([r, g, b]: RGB) {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string) {
  const x = parse(a); const y = parse(b);
  if (!x || !y) return 21;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** A colour laid over a background at some opacity (for tints like `${colour}26`). */
export function over(fg: string, alpha: number, bg: string) {
  const a = parse(fg); const b = parse(bg);
  if (!a || !b) return bg;
  return toHex(a.map((v, i) => v * alpha + b[i] * (1 - alpha)) as RGB);
}

/** The colour, darkened only as much as needed to be readable (≥ `min`:1) on `bg`. */
export function readableOn(colour: string, bg: string, min = 4.5) {
  const c = parse(colour);
  if (!c || contrastRatio(colour, bg) >= min) return colour;
  for (let k = 0.04; k <= 1; k += 0.04) {
    const d = toHex(c.map((v) => v * (1 - k)) as RGB);
    if (contrastRatio(d, bg) >= min) return d;
  }
  return '#000000';
}
