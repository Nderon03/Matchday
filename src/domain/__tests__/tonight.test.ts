import { tonightTable } from '../tonight';
import { balanceTeams, mixAfterLastGame, type BalancePlayer } from '../balancing';

const t = (score: number, ids: string[]) => ({ score, players: ids.map((user_id) => ({ user_id })) });

describe("tonight's table", () => {
  it('adds up each player across games with changing teams', () => {
    const rows = tonightTable([
      { played: true, teams: [t(3, ['sam', 'jo']), t(1, ['al', 'bo'])] },
      { played: true, teams: [t(2, ['sam', 'al']), t(2, ['jo', 'bo'])] },
      { played: false, teams: [t(0, ['sam']), t(0, ['bo'])] },
    ]);
    expect(rows[0]).toEqual({ user_id: 'sam', played: 2, won: 1, drawn: 1, lost: 0, points: 4, gd: 2 });
    expect(rows.find((r) => r.user_id === 'bo')).toMatchObject({ won: 0, drawn: 1, lost: 1, points: 1 });
  });
});

describe('next game teams', () => {
  it('are fair but mixed up from the last game', () => {
    const players: BalancePlayer[] = Array.from({ length: 10 }, (_, i) => ({ user_id: `p${i}`, position: 'ANY' as const, group_rating: 7, games: 10 }));
    const last = { A: ['p0', 'p1', 'p2', 'p3', 'p4'], B: ['p5', 'p6', 'p7', 'p8', 'p9'] };
    let r = 0;
    const random = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const res = balanceTeams(players, { recentPairings: mixAfterLastGame([], last), random });
    const stayed = res.A.filter((id) => last.A.includes(id)).length;
    expect(stayed).toBeGreaterThan(0);
    expect(stayed).toBeLessThan(5);
  });
});
