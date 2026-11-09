// Tonight's mini league: each player's record across the night's games (teams change each game).

export interface TonightFixture {
  played: boolean;
  teams: { score: number | null; players: { user_id: string | null }[] }[];
}
export interface TonightRow { user_id: string; played: number; won: number; drawn: number; lost: number; points: number; gd: number }

export function tonightTable(fixtures: TonightFixture[]): TonightRow[] {
  const rows = new Map<string, TonightRow>();
  for (const f of fixtures) {
    if (!f.played || f.teams.length < 2) continue;
    const [a, b] = f.teams;
    if (a.score == null || b.score == null) continue;
    for (const [mine, theirs] of [[a, b], [b, a]] as const) {
      for (const p of mine.players) {
        if (!p.user_id) continue;
        const r = rows.get(p.user_id) ?? { user_id: p.user_id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, gd: 0 };
        r.played += 1;
        r.gd += (mine.score ?? 0) - (theirs.score ?? 0);
        if (mine.score! > theirs.score!) { r.won += 1; r.points += 3; } else if (mine.score === theirs.score) { r.drawn += 1; r.points += 1; } else r.lost += 1;
        rows.set(p.user_id, r);
      }
    }
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || y.gd - x.gd || y.won - x.won);
}
