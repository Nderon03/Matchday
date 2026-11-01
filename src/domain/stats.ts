/**
 * Pure statistics helpers. The authoritative calculations run server-side in
 * PostgreSQL (see supabase/migrations/*_statistics.sql); these mirror the same rules
 * for client display, optimistic previews and unit testing of the rules themselves.
 */

export type Result = 'W' | 'D' | 'L';

export interface SessionStatRow {
  played_at: string;
  fixtures_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  rating_avg: number | null;
  rating_eligible: boolean;
  motm: boolean;
}

export function round(value: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Win percentage over fixtures played, to one decimal place. */
export function winPercentage(wins: number, fixturesPlayed: number): number {
  if (fixturesPlayed <= 0) return 0;
  return round((100 * wins) / fixturesPlayed, 1);
}

/** Mirrors public.min_ratings_required(). */
export function minRatingsRequired(participants: number, override?: number | null): number {
  if (override != null) return override;
  if (participants <= 2) return 1;
  return Math.min(5, Math.max(2, Math.ceil(0.4 * (participants - 1))));
}

/** A player's session rating: average of valid ratings received, or null if below the threshold. */
export function sessionRating(scores: number[], participants: number, override?: number | null): { rating: number | null; eligible: boolean; count: number } {
  const valid = scores.filter((s) => Number.isInteger(s) && s >= 1 && s <= 10);
  if (valid.length === 0) return { rating: null, eligible: false, count: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return { rating: round(avg, 2), eligible: valid.length >= minRatingsRequired(participants, override), count: valid.length };
}

/** Career rating: every eligible session counts equally, regardless of how many people voted. */
export function careerRating(rows: Pick<SessionStatRow, 'rating_avg' | 'rating_eligible'>[]): number | null {
  const ratings = rows.filter((r) => r.rating_eligible && r.rating_avg != null).map((r) => Number(r.rating_avg));
  if (!ratings.length) return null;
  return round(ratings.reduce((a, b) => a + b, 0) / ratings.length, 1);
}

/** Average of the last N eligible session ratings (most recent first by played_at). */
export function recentForm(rows: Pick<SessionStatRow, 'rating_avg' | 'rating_eligible' | 'played_at'>[], n = 5): number | null {
  const recent = [...rows]
    .filter((r) => r.rating_eligible && r.rating_avg != null)
    .sort((a, b) => b.played_at.localeCompare(a.played_at))
    .slice(0, n);
  return careerRating(recent.map((r) => ({ rating_avg: r.rating_avg, rating_eligible: true })));
}

export function highestRating(rows: Pick<SessionStatRow, 'rating_avg' | 'rating_eligible'>[]): number | null {
  const r = rows.filter((x) => x.rating_eligible && x.rating_avg != null).map((x) => Number(x.rating_avg));
  return r.length ? Math.max(...r) : null;
}

/** Most improved: mean of the recent half minus mean of the earliest half (needs ≥ minSessions). */
export function improvement(rows: Pick<SessionStatRow, 'rating_avg' | 'rating_eligible' | 'played_at'>[], minSessions = 6): number | null {
  const rated = rows
    .filter((r) => r.rating_eligible && r.rating_avg != null)
    .sort((a, b) => a.played_at.localeCompare(b.played_at))
    .map((r) => Number(r.rating_avg));
  if (rated.length < minSessions) return null;
  const half = Math.floor(rated.length / 2);
  const early = rated.slice(0, half);
  const recent = rated.slice(rated.length - half);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return round(mean(recent) - mean(early), 2);
}

export interface Streaks {
  currentWin: number;
  bestWin: number;
  currentUnbeaten: number;
  bestUnbeaten: number;
}

/** Fixture-level streaks from results in chronological order. */
export function streaks(results: Result[]): Streaks {
  let cw = 0, bw = 0, cu = 0, bu = 0;
  for (const r of results) {
    cw = r === 'W' ? cw + 1 : 0;
    cu = r !== 'L' ? cu + 1 : 0;
    bw = Math.max(bw, cw);
    bu = Math.max(bu, cu);
  }
  return { currentWin: cw, bestWin: bw, currentUnbeaten: cu, bestUnbeaten: bu };
}

export interface FixtureScore {
  fixtureId: string;
  myScore: number;
  theirScore: number;
}

/** Session summary for one player: a multi-fixture session is one appearance with many fixtures. */
export function sessionSummary(fixtures: FixtureScore[]) {
  const wins = fixtures.filter((f) => f.myScore > f.theirScore).length;
  const draws = fixtures.filter((f) => f.myScore === f.theirScore).length;
  const losses = fixtures.length - wins - draws;
  return {
    appearances: fixtures.length > 0 ? 1 : 0,
    fixturesPlayed: fixtures.length,
    wins,
    draws,
    losses,
    goalsFor: fixtures.reduce((a, f) => a + f.myScore, 0),
    goalsAgainst: fixtures.reduce((a, f) => a + f.theirScore, 0),
  };
}

export function careerTotals(rows: SessionStatRow[]) {
  const sum = (k: keyof SessionStatRow) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const fixtures = sum('fixtures_played');
  const wins = sum('wins');
  return {
    sessions: rows.length,
    fixtures,
    wins,
    draws: sum('draws'),
    losses: sum('losses'),
    goals: sum('goals'),
    assists: sum('assists'),
    motm: rows.filter((r) => r.motm).length,
    rating: careerRating(rows),
    form: recentForm(rows),
    winPct: winPercentage(wins, fixtures),
  };
}
