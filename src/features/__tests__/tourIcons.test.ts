import fs from 'fs';
import path from 'path';
import { TOUR_ICONS } from '../tourIcons';

describe('tip icons', () => {
  it('every emoji used in a tip has its own app icon', () => {
    const files = ['../screenTours.ts', '../../app/(app)/(tabs)/index.tsx', '../../app/(app)/group/[id]/index.tsx'];
    const used = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      for (const m of src.matchAll(/emoji: '([^']+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(40);
    expect([...used].filter((e) => !TOUR_ICONS[e])).toEqual([]);
  });
});
