import { reportUnlocks } from '../matchReport';

it('match report unlocks: best per player, highest first, at most four', () => {
  const names: Record<string, string> = { a: 'Jordan Pike', b: 'Sam Carter', c: 'Chris Obi', d: 'Leo Hart', e: 'Ali Khan' };
  const rows = [
    { user_id: 'a', achievement_code: 'goals_l1' }, { user_id: 'a', achievement_code: 'goals_l3' },
    { user_id: 'b', achievement_code: 'motm_l2' }, { user_id: 'c', achievement_code: 'apps_l1' },
    { user_id: 'd', achievement_code: 'wins_l4' }, { user_id: 'e', achievement_code: 'apps_l1' },
    { user_id: 'b', achievement_code: 'season_champion' }, { user_id: 'x', achievement_code: 'nonsense' },
  ];
  const r = reportUnlocks(rows, (id) => names[id] ?? 'Player');
  expect(r.map((u) => `${u.name} · ${u.medal}`)).toEqual(['Leo · Win Streak Platinum', 'Jordan · Goals Gold', 'Sam · Man of the Match Silver', 'Chris · Appearances Bronze']);
});
