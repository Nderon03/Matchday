/**
 * The app ships a trimmed icon font (scripts/subset-icons.py). If a screen uses an icon that isn't in
 * it, the icon would show blank on phones, so this fails until the font is regenerated.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../../..');
const glyphMap = JSON.parse(readFileSync(join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'), 'utf8'));
const inFont = new Set<string>(JSON.parse(readFileSync(join(root, 'assets/fonts/Ionicons.names.json'), 'utf8')));

function files(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' || f === '__tests__' ? [] : files(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

it('every icon the app uses is in the trimmed icon font', () => {
  const used = new Set<string>();
  for (const p of [...files(join(root, 'src'), ['.ts', '.tsx']), ...files(join(root, 'supabase'), ['.sql', '.ts'])]) {
    for (const m of readFileSync(p, 'utf8').matchAll(/['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)) if (m[1] in glyphMap) used.add(m[1]);
  }
  const missing = [...used].filter((n) => !inFont.has(n));
  expect(missing).toEqual([]); // run: python3 scripts/subset-icons.py
});
