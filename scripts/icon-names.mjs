// Every Ionicons name the app can show: any quoted word in the app, the database code or the server
// functions that is an Ionicons name (icons are always written out in full, never glued together).
// Used by scripts/subset-icons.py and by the test that keeps the trimmed icon font complete.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
export const glyphMap = JSON.parse(readFileSync(join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'), 'utf8'));

function* files(dir, exts) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '__tests__') yield* files(p, exts); }
    else if (exts.some((e) => p.endsWith(e))) yield p;
  }
}

export function usedIconNames() {
  const names = new Set();
  const sources = [...files(join(root, 'src'), ['.ts', '.tsx']), ...files(join(root, 'supabase'), ['.sql', '.ts'])];
  for (const p of sources) {
    for (const m of readFileSync(p, 'utf8').matchAll(/['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)) {
      if (m[1] in glyphMap) names.add(m[1]);
    }
  }
  return [...names].sort();
}

if (process.argv[1] && process.argv[1].endsWith('icon-names.mjs')) console.log(JSON.stringify(usedIconNames()));
