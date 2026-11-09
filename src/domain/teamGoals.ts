// Mirrors public.session_goal_credits / check_team_goal_limits: the goals and assists credited
// to each team's players, so hosts (and players) can see what's left before the server says no.

export interface TGFixture {
  id: string;
  number: number;
  played: boolean;
  teams: { id: string; name: string; side: string; score: number | null; players: { user_id: string | null }[] }[];
}
export interface TGCredit { fixture_id: string | null; user_id: string; goals: number; assists: number }
export interface TeamTotal {
  fixtureId: string;
  number: number;
  teamId: string;
  name: string;
  score: number;
  goals: number;
  assists: number;
  /** goals scored that nobody has been credited with yet */
  goalsLeft: number;
  assistsLeft: number;
}

/** Which team a credit counts for: its game's team, or the player's only played game. */
function teamFor(fixtures: TGFixture[], c: TGCredit): string | null {
  const played = fixtures.filter((f) => f.played);
  const mine = played.filter((f) => f.teams.some((t) => t.players.some((p) => p.user_id === c.user_id)));
  const fixture = c.fixture_id ? played.find((f) => f.id === c.fixture_id) : mine.length === 1 ? mine[0] : undefined;
  return fixture?.teams.find((t) => t.players.some((p) => p.user_id === c.user_id))?.id ?? null;
}

export function teamTotals(fixtures: TGFixture[], credits: TGCredit[]): TeamTotal[] {
  const out = new Map<string, TeamTotal>();
  for (const f of fixtures) {
    if (!f.played) continue;
    for (const t of f.teams) {
      if (t.score == null) continue;
      out.set(t.id, { fixtureId: f.id, number: f.number, teamId: t.id, name: t.name || `Team ${t.side}`, score: t.score, goals: 0, assists: 0, goalsLeft: t.score, assistsLeft: t.score });
    }
  }
  for (const c of credits) {
    const id = teamFor(fixtures, c);
    const t = id ? out.get(id) : undefined;
    if (!t) continue;
    t.goals += c.goals;
    t.assists += c.assists;
  }
  for (const t of out.values()) {
    t.goalsLeft = t.score - t.goals;
    t.assistsLeft = t.score - t.assists;
  }
  return [...out.values()];
}

/** For one player: their team's total in their (only) game, ignoring their own credits. */
export function roomForPlayer(fixtures: TGFixture[], credits: TGCredit[], userId: string) {
  const mine = fixtures.filter((f) => f.played && f.teams.some((t) => t.players.some((p) => p.user_id === userId)));
  if (mine.length !== 1) return null;
  const team = mine[0].teams.find((t) => t.players.some((p) => p.user_id === userId));
  if (!team || team.score == null) return null;
  const others = teamTotals(fixtures, credits.filter((c) => c.user_id !== userId)).find((t) => t.teamId === team.id);
  return { score: team.score, matesGoals: others?.goals ?? 0, matesAssists: others?.assists ?? 0, goalsLeft: team.score - (others?.goals ?? 0), assistsLeft: team.score - (others?.assists ?? 0) };
}
