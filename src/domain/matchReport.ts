import { SEASON_CHAMPION, TRACKS, levelInfo, parseCode } from './achievements';
import { firstName } from './format';

/**
 * The "Unlocked tonight" lines on the match report: each player's best medal or level won in this
 * game, highest first, at most four (e.g. "Jordan · Goals Gold").
 */
export function reportUnlocks(rows: { user_id: string; achievement_code: string }[], nameOf: (id: string) => string, max = 4) {
  const best = new Map<string, { level: number; medal: string; colour: string }>();
  for (const r of rows) {
    if (r.achievement_code === SEASON_CHAMPION.code) continue; // that's the season's moment, not tonight's
    const { track, level } = parseCode(r.achievement_code);
    const def = TRACKS.find((t) => t.track === track);
    if (!def || !level) continue;
    const info = levelInfo(level);
    const cur = best.get(r.user_id);
    if (!cur || level > cur.level) best.set(r.user_id, { level, medal: `${def.name} ${info.label}`, colour: info.colour });
  }
  return [...best.entries()]
    .sort((a, b) => b[1].level - a[1].level)
    .slice(0, max)
    .map(([id, u]) => ({ name: firstName(nameOf(id)), medal: u.medal, colour: u.colour }));
}
