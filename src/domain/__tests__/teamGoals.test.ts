import { roomForPlayer, teamTotals, type TGFixture } from '../teamGoals';

const team = (id: string, side: string, score: number | null, users: string[]) => ({ id, name: side === 'A' ? 'Bibs' : 'Colours', side, score, players: users.map((user_id) => ({ user_id })) });
const one: TGFixture[] = [{ id: 'f1', number: 1, played: true, teams: [team('a', 'A', 4, ['john', 'smith', 'sam']), team('b', 'B', 1, ['x', 'y'])] }];

describe('team totals', () => {
  it('adds up what each team’s players are credited with', () => {
    const t = teamTotals(one, [{ fixture_id: null, user_id: 'john', goals: 3, assists: 1 }, { fixture_id: null, user_id: 'smith', goals: 1, assists: 2 }]);
    expect(t.find((x) => x.teamId === 'a')).toMatchObject({ name: 'Bibs', score: 4, goals: 4, assists: 3, goalsLeft: 0, assistsLeft: 1 });
    expect(t.find((x) => x.teamId === 'b')).toMatchObject({ goals: 0, goalsLeft: 1 });
  });
  it('tells a player how many their team has left for them', () => {
    expect(roomForPlayer(one, [{ fixture_id: null, user_id: 'john', goals: 3, assists: 0 }, { fixture_id: null, user_id: 'sam', goals: 1, assists: 0 }], 'sam'))
      .toEqual({ score: 4, matesGoals: 3, matesAssists: 0, goalsLeft: 1, assistsLeft: 4 });
  });
  it('multi-game: credits count per game; unsplit ones from several games aren’t pinned to a team', () => {
    const two: TGFixture[] = [...one, { id: 'f2', number: 2, played: true, teams: [team('c', 'A', 2, ['john', 'x']), team('d', 'B', 0, ['smith', 'y'])] }];
    const t = teamTotals(two, [{ fixture_id: 'f2', user_id: 'john', goals: 2, assists: 0 }, { fixture_id: null, user_id: 'smith', goals: 1, assists: 0 }]);
    expect(t.find((x) => x.teamId === 'c')?.goals).toBe(2);
    expect(t.find((x) => x.teamId === 'a')?.goals).toBe(0);
    expect(roomForPlayer(two, [], 'john')).toBeNull();
  });
});
