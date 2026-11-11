/**
 * Achievements are tracks with five levels (Bronze → Legend), mirrored in the SQL catalogue
 * (migration 29). Codes are `<track>_l<level>`, plus the one-off `season_champion`.
 */
export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export const LEVELS: { label: string; colour: string }[] = [
  { label: 'Bronze', colour: '#D08A4E' },
  { label: 'Silver', colour: '#C7CED8' },
  { label: 'Gold', colour: '#F5B014' },
  { label: 'Platinum', colour: '#67E8F9' },
  { label: 'Legend', colour: '#C084FC' },
];
export const levelInfo = (level: number) => LEVELS[Math.max(1, Math.min(5, level)) - 1];

export interface TrackDef { track: string; name: string; icon: string; targets: number[]; unit: (n: number) => string }

export const TRACKS: TrackDef[] = [
  { track: 'apps', name: 'Appearances', icon: 'shirt', targets: [1, 10, 25, 50, 100], unit: (n) => `${n} ${n === 1 ? 'game' : 'games'}` },
  { track: 'goals', name: 'Goals', icon: 'football', targets: [1, 10, 25, 50, 100], unit: (n) => `${n} ${n === 1 ? 'goal' : 'goals'}` },
  { track: 'assists', name: 'Assists', icon: 'git-merge', targets: [1, 10, 25, 50, 100], unit: (n) => `${n} ${n === 1 ? 'assist' : 'assists'}` },
  { track: 'motm', name: 'Man of the Match', icon: 'star', targets: [1, 5, 10, 25, 50], unit: (n) => `${n} ${n === 1 ? 'award' : 'awards'}` },
  { track: 'weeks', name: 'Ever-present', icon: 'flame', targets: [3, 5, 10, 20, 40], unit: (n) => `${n} weeks in a row` },
  { track: 'wins', name: 'Win Streak', icon: 'trending-up', targets: [3, 5, 7, 10, 15], unit: (n) => `${n} wins in a row` },
  { track: 'unbeaten', name: 'Unbeaten Run', icon: 'shield-checkmark', targets: [5, 10, 15, 20, 30], unit: (n) => `${n} unbeaten` },
  { track: 'haul', name: 'Big Game', icon: 'flash', targets: [2, 3, 4, 5, 6], unit: (n) => `${n} goals in a game` },
];

export const SEASON_CHAMPION = { code: 'season_champion', name: 'Player of the Season', icon: 'ribbon' };

/** Track and level from a code ("goals_l3" → goals, 3). Season Champion counts as a Legend medal. */
export function parseCode(code: string): { track: string; level: Level } {
  const m = /^(.+)_l([1-5])$/.exec(code);
  if (m) return { track: m[1], level: Number(m[2]) as Level };
  return { track: code, level: code === SEASON_CHAMPION.code ? 5 : 1 };
}

/** Level reached for a value, and what the next level needs. */
export function trackProgress(value: number, targets: number[]): { level: Level; next: number | null; prev: number } {
  let level = 0;
  while (level < targets.length && value >= targets[level]) level++;
  return { level: level as Level, next: level < targets.length ? targets[level] : null, prev: level ? targets[level - 1] : 0 };
}

/** Codes a player qualifies for given their track values. */
export function qualifyingCodes(values: Record<string, number>): string[] {
  const out: string[] = [];
  for (const t of TRACKS) t.targets.forEach((target, i) => { if ((values[t.track] ?? 0) >= target) out.push(`${t.track}_l${i + 1}`); });
  if ((values.season_champion ?? 0) > 0) out.push(SEASON_CHAMPION.code);
  return out;
}

/** Medal points: the best level in each track (Bronze 1 … Legend 5). Season Champion doesn't count. */
export function medalPoints(unlockedCodes: Iterable<string>): number {
  const best: Record<string, number> = {};
  for (const c of unlockedCodes) {
    if (c === SEASON_CHAMPION.code) continue;
    const { track, level } = parseCode(c);
    best[track] = Math.max(best[track] ?? 0, level);
  }
  return Object.values(best).reduce((a, b) => a + b, 0);
}
export const MAX_POINTS = TRACKS.length * 5;

export type CardStyleId = 'classic' | 'midnight' | 'crimson' | 'royal' | 'sunset' | 'stealth' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'hall_of_fame';
export interface CardStyle {
  id: CardStyleId; name: string; points: number;
  from: string; to: string; accent: string; muted: string; border: string | null; label?: string;
  /**
   * the earned tier (0 = a free base colour). Each tier has its own design (see CardFX); from
   * Platinum (4) up the card is animated, and it gets more so at Diamond (5) and Hall of Fame (6).
   */
  fx: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** the icon either side of the name at the top of the card */
  icon?: 'shield' | 'shield-checkmark' | 'star' | 'flash' | 'diamond' | 'trophy';
  /** free base colours anyone can pick */
  base?: boolean;
}
/** Player card / profile banner styles. Base colours are free; the rest unlock with medal points (checked again on the server). */
export const CARD_STYLES: CardStyle[] = [
  { id: 'classic', name: 'Pitch', points: 0, base: true, fx: 0, from: '#123D26', to: '#0A0F0C', accent: '#22C55E', muted: '#9FB3A8', border: null },
  { id: 'midnight', name: 'Midnight', points: 0, base: true, fx: 0, from: '#10254A', to: '#05080F', accent: '#60A5FA', muted: '#9AAFCB', border: null },
  { id: 'crimson', name: 'Crimson', points: 0, base: true, fx: 0, from: '#4A1018', to: '#0E0406', accent: '#F87171', muted: '#C9A0A4', border: null },
  { id: 'royal', name: 'Royal', points: 0, base: true, fx: 0, from: '#2E1650', to: '#0A0512', accent: '#C084FC', muted: '#B3A1C9', border: null },
  { id: 'sunset', name: 'Sunset', points: 0, base: true, fx: 0, from: '#4A230B', to: '#120804', accent: '#FB923C', muted: '#CBAE98', border: null },
  { id: 'stealth', name: 'Stealth', points: 0, base: true, fx: 0, from: '#2A2D33', to: '#08090A', accent: '#E5E7EB', muted: '#A1A6AE', border: null },
  { id: 'bronze', name: 'Bronze', points: 4, fx: 1, icon: 'shield', from: '#4A2A12', to: '#140904', accent: '#E39A5B', muted: '#C9A585', border: '#B8722F' },
  { id: 'silver', name: 'Silver', points: 8, fx: 2, icon: 'shield-checkmark', from: '#5A6573', to: '#13171C', accent: '#F1F5F9', muted: '#B8C2CE', border: '#DDE3EA' },
  { id: 'gold', name: 'Gold', points: 16, fx: 3, icon: 'star', from: '#2E2006', to: '#080602', accent: '#FFD45C', muted: '#D9C08A', border: '#C9961A' },
  { id: 'platinum', name: 'Platinum', points: 26, fx: 4, icon: 'flash', from: '#22566A', to: '#04131A', accent: '#A5F3FC', muted: '#A9D3DC', border: '#D9FBFF' },
  { id: 'diamond', name: 'Diamond', points: 33, fx: 5, icon: 'diamond', from: '#0E3A78', to: '#020A1C', accent: '#E0F2FE', muted: '#9FC3E6', border: '#BAE6FD' },
  { id: 'hall_of_fame', name: 'Hall of Fame', points: MAX_POINTS, fx: 6, icon: 'trophy', from: '#4C1D95', to: '#12041F', accent: '#F5C542', muted: '#D4B8F0', border: '#F5C542', label: 'HALL OF FAME' },
];
export const cardStyle = (id?: string | null) => CARD_STYLES.find((s) => s.id === id) ?? CARD_STYLES[0];

/** "6% of players" style rarity; null when there are too few players for it to mean anything. */
export function rarityLabel(holders: number, players: number): string | null {
  if (players < 10) return null;
  const pct = (100 * holders) / players;
  if (pct === 0) return 'No one yet';
  if (pct < 1) return 'Under 1% of players';
  return `${Math.round(pct)}% of players`;
}

/** Tracks where "one more" is something you can just go and do. */
const NUDGE_UNITS: Record<string, [string, string]> = {
  goals: ['goal', 'goals'], assists: ['assist', 'assists'], apps: ['game', 'games'], motm: ['MOTM award', 'MOTM awards'], weeks: ['week in a row', 'weeks in a row'],
};

/**
 * The medal a player is one step from, e.g. "1 goal from Gold in Goals". Picks the highest level
 * when several are close. Null when nothing is within one.
 */
export function nearlyThere(items: { track: string; level: number | null; target: number; value: number; unlocked_at: string | null }[]):
  { track: string; name: string; icon: string; level: number; label: string; progress: number; target: number } | null {
  let best: ReturnType<typeof nearlyThere> = null;
  for (const t of TRACKS) {
    const units = NUDGE_UNITS[t.track];
    if (!units) continue;
    const levels = items.filter((i) => i.track === t.track);
    const reached = levels.filter((i) => i.unlocked_at).reduce((m, i) => Math.max(m, i.level ?? 0), 0);
    if (reached >= 5) continue;
    const next = levels.find((i) => i.level === reached + 1);
    if (!next) continue;
    const left = next.target - next.value;
    if (left !== 1) continue;
    const nextLevel = reached + 1;
    if (best && best.level >= nextLevel) continue;
    best = {
      track: t.track, name: t.name, icon: t.icon, level: nextLevel, progress: next.value - (reached ? t.targets[reached - 1] : 0), target: next.target - (reached ? t.targets[reached - 1] : 0),
      label: `1 ${units[0]} from ${levelInfo(nextLevel).label} in ${t.name}`,
    };
  }
  return best;
}
