/** Achievements v2: weekly streaks, progress and rarity for the achievements screen, quiet awarding. */
import { Db, uniq, expectAppError } from './helpers';

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

  it('awards every level reached, and can do it quietly without dating it as new', async () => {
    const u = await db.createUser(uniq('wa'));
    await playWeeks(u, [0, 1, 2, 3, 4], 1);
    await db.admin(`select set_config('matchday.quiet_achievements', 'on', false)`);
    await db.admin(`select award_achievements($1)`, [u]);
    await db.admin(`select set_config('matchday.quiet_achievements', 'off', false)`);
    const codes = (await db.admin(`select achievement_code c from player_achievements where user_id = $1 order by 1`, [u])).map((r) => r.c);
    // 5 games, 5 goals, 5 weeks in a row, 1 goal in a game (win streaks need real fixtures, covered in journey)
    expect(codes).toEqual(['apps_l1', 'goals_l1', 'weeks_l1', 'weeks_l2']);
    expect((await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'achievement_unlocked'`, [u]))[0].n).toBe(0);
    // apps 1 + goals 1 + weeks 2
    expect((await db.admin(`select medal_points($1) p`, [u]))[0].p).toBe(4);
  });

  it('notifies level-ups with the level name', async () => {
    const u = await db.createUser(uniq('wn'));
    await playWeeks(u, [0], 3);
    await db.admin(`select award_achievements($1)`, [u]);
    const titles = (await db.admin(`select title from notifications where user_id = $1 and type = 'achievement_unlocked' order by title`, [u])).map((r) => r.title);
    expect(titles).toContain('Achievement unlocked: Big Game · Silver');
    expect(titles).toContain('Achievement unlocked: Goals · Bronze');
  });

  it('gives the signed-in player tracks with values, unlock dates, holders, points and streak', async () => {
    const u = await db.createUser(uniq('wp'));
    await playWeeks(u, [0, 1], 2);
    await db.admin(`select award_achievements($1)`, [u]);
    const r = await db.rpc<any>(u, 'get_my_achievements');
    expect(r.streak).toEqual({ current: 2, best: 2 });
    expect(r.players).toBeGreaterThan(0);
    expect(r.card_style).toBe('classic');
    const by = Object.fromEntries(r.items.map((i: any) => [i.code, i]));
    expect(by.goals_l2).toMatchObject({ track: 'goals', level: 2, value: 4, target: 10, unlocked_at: null, tier: 'silver' });
    expect(by.goals_l1.unlocked_at).not.toBeNull();
    expect(by.goals_l1.holders).toBeGreaterThan(0);
    expect(by.haul_l1.unlocked_at).not.toBeNull();
    expect(by.season_champion).toMatchObject({ track: 'season_champion', level: null, value: 0 });
    expect(r.items.filter((i: any) => i.track === 'goals')).toHaveLength(5);
    expect(r.points).toBe(3); // apps, goals, haul at bronze
    await expect(db.as(u, `select award_achievements($1)`, [u])).rejects.toThrow(/permission denied/);
  });

  it('card styles unlock with medal points and can only be set through the check', async () => {
    const u = await db.createUser(uniq('wc'));
    await playWeeks(u, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2); // apps silver, goals silver, weeks gold, big game bronze = 8
    await db.admin(`select award_achievements($1)`, [u]);
    const points = (await db.admin(`select medal_points($1) p`, [u]))[0].p;
    expect(points).toBeGreaterThanOrEqual(8);
    expect(await db.rpc(u, 'set_card_style', { p_style: 'silver' })).toBe('silver');
    await expectAppError(db.rpc(u, 'set_card_style', { p_style: 'hall_of_fame' }), 'style_locked');
    await expectAppError(db.rpc(u, 'set_card_style', { p_style: 'rainbow' }), 'invalid_style');
    await expect(db.as(u, `update profiles set card_style = 'hall_of_fame' where id = $1`, [u])).rejects.toThrow(/permission denied/);
    expect((await db.admin(`select card_style from profiles where id = $1`, [u]))[0].card_style).toBe('silver');
  });
});

describe('after-match reveal and personal bests', () => {
  it('lists recently finalised games with the bests from before each game', async () => {
    const u = await db.createUser(uniq('rv'));
    const host = await db.createUser(uniq('rh'));
    const mk = async (weeksAgo: number, goals: number, assists: number, rating: number | null, motm = false, finalisedDaysAgo = 1) => {
      const sid = await db.rpc<string>(host, 'create_session', { p: { name: `Game ${weeksAgo}`, starts_at: new Date(Date.now() + DAY).toISOString(), format_size: 5 } });
      await db.admin(`update sessions set status = 'finalised', finalised_at = now() - make_interval(days => $2) where id = $1`, [sid, finalisedDaysAgo]);
      await db.admin(
        `insert into session_player_statistics (session_id, user_id, played_at, fixtures_played, wins, goals, assists, rating_avg, rating_eligible, motm)
         values ($1, $2, $3, 2, 1, $4, $5, $6, $7, $8)`,
        [sid, u, mondayNoon(weeksAgo), goals, assists, rating, rating !== null, motm],
      );
      return sid;
    };
    await mk(5, 1, 0, 7.0, false, 30); // old: not in the reveal list
    await mk(4, 2, 1, 7.4, false, 30);
    await mk(3, 0, 0, 6.8, false, 30);
    const latest = await mk(0, 3, 2, 8.1, true, 0);
    const reveals = await db.rpc<any[]>(u, 'get_match_reveals');
    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ session_id: latest, goals: 3, assists: 2, motm: true, prev_max_goals: 2, prev_max_assists: 1, prev_rated: 3 });
    expect(Number(reveals[0].prev_best_rating)).toBe(7.4);

    const pb = await db.rpc<any>(u, 'get_personal_bests', { p_user: u });
    expect(pb.most_goals).toMatchObject({ value: 3, session_id: latest });
    expect(Number(pb.best_rating.value)).toBe(8.1);
    expect(pb.best_weeks).toBe(3); // weeks 3, 4 and 5 ago in a row

    // private profiles keep their bests to themselves
    const other = await db.createUser(uniq('ro'));
    await db.admin(`update user_preferences set profile_visibility = 'private', show_stats = false where user_id = $1`, [u]);
    expect(await db.rpc(other, 'get_personal_bests', { p_user: u })).toBeNull();
    expect(await db.rpc(u, 'get_personal_bests', { p_user: u })).not.toBeNull();
  });
});
