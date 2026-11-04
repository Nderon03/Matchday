/** What's worth calling out after a game. Only meaningful, fairly rare moments. */
export interface MatchReveal {
  session_id: string;
  name: string;
  played_at: string;
  finalised_at: string;
  group_name: string | null;
  fixtures_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  rating_avg: number | string | null;
  rating_eligible: boolean;
  motm: boolean;
  motm_shared: boolean;
  prev_max_goals: number;
  prev_max_assists: number;
  prev_best_rating: number | string | null;
  prev_rated: number;
}

export type Highlight =
  | { kind: 'motm'; shared: boolean }
  | { kind: 'goals_pb'; value: number }
  | { kind: 'assists_pb'; value: number }
  | { kind: 'rating_pb'; value: number };

/** Ratings need a few games behind them before "best ever" means anything. */
export const MIN_RATED_FOR_PB = 3;

export function matchHighlights(r: MatchReveal): Highlight[] {
  const out: Highlight[] = [];
  if (r.motm) out.push({ kind: 'motm', shared: r.motm_shared });
  if (r.goals >= 2 && r.goals > r.prev_max_goals) out.push({ kind: 'goals_pb', value: r.goals });
  if (r.assists >= 2 && r.assists > r.prev_max_assists) out.push({ kind: 'assists_pb', value: r.assists });
  const rating = r.rating_avg === null ? null : Number(r.rating_avg);
  const prev = r.prev_best_rating === null ? null : Number(r.prev_best_rating);
  if (r.rating_eligible && rating !== null && r.prev_rated >= MIN_RATED_FOR_PB && prev !== null && rating > prev) {
    out.push({ kind: 'rating_pb', value: rating });
  }
  return out;
}

export function highlightText(h: Highlight): { title: string; detail: string } {
  switch (h.kind) {
    case 'motm': return { title: h.shared ? 'Joint Man of the Match' : 'Man of the Match', detail: 'Voted by your teammates' };
    case 'goals_pb': return { title: `${h.value} goals`, detail: 'The most you’ve scored in a game' };
    case 'assists_pb': return { title: `${h.value} assists`, detail: 'The most you’ve set up in a game' };
    case 'rating_pb': return { title: `${h.value.toFixed(1)} rating`, detail: 'Your best rating yet' };
  }
}

/** Which reveals to show: unseen ones, newest two at most (older ones are skipped quietly). */
export function pendingReveals(all: MatchReveal[], seen: Iterable<string>): { show: MatchReveal[]; skip: MatchReveal[] } {
  const s = new Set(seen);
  const unseen = all.filter((r) => !s.has(r.session_id)).sort((a, b) => a.finalised_at.localeCompare(b.finalised_at));
  return { show: unseen.slice(-2), skip: unseen.slice(0, -2) };
}
