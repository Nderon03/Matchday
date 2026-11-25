import fs from 'fs';
import path from 'path';
import { isWhatsNewDue, RELEASES } from '../whatsNewData';

describe('what’s new', () => {
  const release = { date: '2026-11-25' };
  it('shows once to people who used the app before the release, after their first tour', () => {
    expect(isWhatsNewDue(release, '2026-10-01T10:00:00Z', null, '1')).toBe(true);
    expect(isWhatsNewDue(release, '2026-10-01T10:00:00Z', '1', '1')).toBe(false); // already seen
    expect(isWhatsNewDue(release, '2026-10-01T10:00:00Z', null, null)).toBe(false); // tour not done yet
  });
  it('never shows to accounts made after the release, or with no date', () => {
    expect(isWhatsNewDue(release, '2026-11-26T09:00:00Z', null, '1')).toBe(false);
    expect(isWhatsNewDue(release, null, null, '1')).toBe(false);
    expect(isWhatsNewDue(release, 'nonsense', null, '1')).toBe(false);
  });
  it('every release has a unique id, a valid date and at least one item', () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RELEASES) {
      expect(Number.isNaN(new Date(r.date).getTime())).toBe(false);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });
  it('uses only icons the app ships', () => {
    const names: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../assets/fonts/Ionicons.names.json'), 'utf8'));
    for (const r of RELEASES) for (const it of r.items) {
      expect(names).toContain(it.icon);
    }
  });
});
