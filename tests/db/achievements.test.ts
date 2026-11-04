/** Achievements v2: weekly streaks, progress and rarity for the achievements screen, quiet awarding. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

const DAY = 86400_000;
const mondayNoon = (weeksAgo: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - weeksAgo * 7 + 2); // Wednesday of that week
  return d.toISOString();
};

/** Give a player a verified game in each of the given weeks (weeks ago, 0 = this week). */
async function playWeeks(user: string, weeksAgo: number[], goals = 0) {
  const host = await db.createUser(uniq('ah'));
  for (const w of weeksAgo) {
    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Streak FC', starts_at: new Date(Date.now() + DAY).toISOString(), format_size: 5 },
    });
    await db.admin(
      `insert into session_player_statistics (session_id, user_id, played_at, fixtures_played, wins, goals) values ($1, $2, $3, 1, 1, $4)`,
      [sid, user, mondayNoon(w), goals],
    );
  }
}

describe('achievements', () => {
  it('counts weeks in a row, keeping the current streak alive until a week is missed', async () => {
    const u = await db.createUser(uniq('ws'));
    await playWeeks(u, [1, 2, 3, 6, 7, 8, 9, 10, 11]);
    const [s] = await db.admin(`select * from player_week_streak($1)`, [u]);
    expect(s).toEqual({ current_weeks: 3, best_weeks: 6 });

    const gone = await db.createUser(uniq('wg'));
    await playWeeks(gone, [3, 4]);
    const [g] = await db.admin(`select * from player_week_streak($1)`, [gone]);
    expect(g).toEqual({ current_weeks: 0, best_weeks: 2 });
  });

  it('awards streak and count achievements, and can do it without notifying', async () => {
    const u = await db.createUser(uniq('wa'));
    await playWeeks(u, [0, 1, 2, 3, 4], 1);
    await db.admin(`select set_config('matchday.quiet_achievements', 'on', false)`);
    await db.admin(`select award_achievements($1)`, [u]);
    await db.admin(`select set_config('matchday.quiet_achievements', 'off', false)`);
    const codes = (await db.admin(`select achievement_code c from player_achievements where user_id = $1 order by 1`, [u])).map((r) => r.c);
    expect(codes).toEqual(['first_goal', 'first_match', 'weeks_5']);
    expect((await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'achievement_unlocked'`, [u]))[0].n).toBe(0);
  });

  it('gives the signed-in player progress, unlock dates, holders and their streak', async () => {
    const u = await db.createUser(uniq('wp'));
    await playWeeks(u, [0, 1], 2);
    await db.admin(`select award_achievements($1)`, [u]);
    const r = await db.rpc<any>(u, 'get_my_achievements');
    expect(r.streak).toEqual({ current: 2, best: 2 });
    expect(r.players).toBeGreaterThan(0);
    const by = Object.fromEntries(r.items.map((i: any) => [i.code, i]));
    expect(by.goals_25).toMatchObject({ progress: 4, target: 25, unlocked_at: null, tier: 'rare', category: 'Scoring' });
    expect(by.hat_trick.progress).toBe(2);
    expect(by.first_goal.unlocked_at).not.toBeNull();
    expect(by.first_goal.holders).toBeGreaterThan(0);
    expect(r.items.map((i: any) => i.code)).toContain('season_champion');
    // clients can't award themselves anything
    await expect(db.as(u, `select award_achievements($1)`, [u])).rejects.toThrow(/permission denied/);
  });
});
