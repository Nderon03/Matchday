/** Leaderboard ranking rules (mirrors public.get_leaderboard). */
export type LeaderboardCategory =
  | 'goals' | 'assists' | 'ga' | 'motm' | 'rating' | 'form' | 'appearances' | 'wins' | 'win_pct' | 'improved' | 'streak';

export const CATEGORIES: { key: LeaderboardCategory; label: string; short: string; unit?: string; decimals?: number }[] = [
  { key: 'goals', label: 'Top goal scorers', short: 'Goals' },
  { key: 'assists', label: 'Most assists', short: 'Assists' },
  { key: 'ga', label: 'Most goals + assists', short: 'G/A' },
  { key: 'motm', label: 'Most MOTM awards', short: 'MOTM' },
  { key: 'rating', label: 'Highest career rating', short: 'Rating', decimals: 1 },
  { key: 'form', label: 'Best recent form', short: 'Form', decimals: 1 },
  { key: 'appearances', label: 'Most appearances', short: 'Apps' },
  { key: 'wins', label: 'Most wins', short: 'Wins' },
  { key: 'win_pct', label: 'Highest win percentage', short: 'Win %', unit: '%', decimals: 1 },
  { key: 'improved', label: 'Most improved player', short: '+Rating', decimals: 2 },
  { key: 'streak', label: 'Longest winning streak', short: 'Streak' },
];

export interface RankInput {
  userId: string;
  value: number | null;
  appearances: number;
}

/** Standard competition ranking (1, 2, 2, 4) with an appearances tiebreak favouring fewer games. */
export function rank(rows: RankInput[], opts: { minAppearances?: number; allowZero?: boolean } = {}) {
  const eligible = rows.filter(
    (r) => r.value != null && r.appearances >= (opts.minAppearances ?? 0) && (opts.allowZero || (r.value as number) > 0),
  );
  eligible.sort((a, b) => (b.value as number) - (a.value as number) || a.appearances - b.appearances || a.userId.localeCompare(b.userId));
  let lastKey = '';
  let lastRank = 0;
  return eligible.map((r, i) => {
    const key = `${r.value}|${r.appearances}`;
    const position = key === lastKey ? lastRank : i + 1;
    lastKey = key;
    lastRank = position;
    return { ...r, rank: position };
  });
}

export function formatValue(category: LeaderboardCategory, value: number) {
  const def = CATEGORIES.find((c) => c.key === category);
  const fixed = def?.decimals != null ? Number(value).toFixed(def.decimals) : String(Math.round(Number(value)));
  const signed = category === 'improved' && value > 0 ? `+${fixed}` : fixed;
  return `${signed}${def?.unit ?? ''}`;
}
