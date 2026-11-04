/** Team of the Month: best five from a group's month, in a 1-2-2 shape, by average rating. */
export interface MonthCandidate {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  position: string;
  rated: number;
  rating: number | string | null;
  goals: number;
  assists: number;
  motm: number;
  apps: number;
}

export type Slot = 'GK' | 'DEF' | 'ATT';
export interface Picked { slot: Slot; player: MonthCandidate; rating: number }
export interface TeamOfMonth { players: Picked[]; captain: MonthCandidate }

/** Ratings need a couple of games behind them in the month. */
export const MIN_RATED_GAMES = 2;
const SLOTS: Slot[] = ['GK', 'DEF', 'DEF', 'ATT', 'ATT'];
const PREFERRED: Record<Slot, string[]> = { GK: ['GK'], DEF: ['DEF'], ATT: ['FWD', 'MID'] };

const score = (c: MonthCandidate) => Number(c.rating ?? 0);
const better = (a: MonthCandidate, b: MonthCandidate) => score(b) - score(a) || b.motm - a.motm || b.goals + b.assists - (a.goals + a.assists) || a.display_name.localeCompare(b.display_name);

export function pickTeamOfMonth(candidates: MonthCandidate[]): TeamOfMonth | null {
  const pool = candidates.filter((c) => c.rated >= MIN_RATED_GAMES && c.rating !== null).sort(better);
  if (pool.length < SLOTS.length) return null;
  const used = new Set<string>();
  const take = (filter: (c: MonthCandidate) => boolean) => {
    const c = pool.find((p) => !used.has(p.user_id) && filter(p));
    if (c) used.add(c.user_id);
    return c ?? null;
  };
  const chosen: (MonthCandidate | null)[] = SLOTS.map(() => null);
  // first fill each slot with someone who prefers that position, best first
  SLOTS.forEach((slot, i) => { chosen[i] = take((c) => PREFERRED[slot].includes(c.position)); });
  // then any empty slot gets the best player left (ANY or out of position)
  SLOTS.forEach((_, i) => { if (!chosen[i]) chosen[i] = take(() => true); });
  const players = chosen.map((p, i) => ({ slot: SLOTS[i], player: p!, rating: score(p!) }));
  const captain = [...players].sort((a, b) => better(a.player, b.player))[0].player;
  return { players, captain };
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
/** First day of a month as YYYY-MM-DD (offset 0 = this month, -1 = last month). */
export function monthStart(offset: number, now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1));
  return d.toISOString().slice(0, 10);
}
