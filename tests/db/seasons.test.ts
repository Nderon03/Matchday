/** Ranked seasons: quarterly, automatic, 7+ games for awards, half the games to qualify, a fair formula. */
import { Db, expectAppError, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

// a group with `games` finalised games this season, and each player's season in numbers
async function season(games: number, players: { apps: number; rating: number; motm?: number; goals?: number }[]) {
  const host = await db.createUser(uniq('sh'));
  const users: string[] = [];
  for (let i = 0; i < players.length; i++) users.push(await db.createUser(uniq('sp')));
  const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Ranked FC', p_join_policy: 'open', p_visibility: 'private' });
  for (const u of users) await db.admin(`insert into group_members (group_id, user_id) values ($1, $2) on conflict do nothing`, [groupId, u]);
  const [{ id: seasonId }] = await db.admin(`select public.ensure_group_season($1, current_date) id`, [groupId]);
  for (let g = 0; g < games; g++) {
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: `Game ${g + 1}`, group_id: groupId, starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5 } });
    await db.admin(`update sessions set status = 'finalised', finalised_at = now(), season_id = $2 where id = $1`, [sid, seasonId]);
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      if (g >= pl.apps) continue;
      await db.admin(`insert into session_player_statistics (session_id, user_id, group_id, season_id, played_at, fixtures_played, wins, goals, rating_avg, rating_count, rating_eligible, motm)
        values ($1, $2, $3, $4, now(), 1, 1, $5, $6, 3, true, $7)`, [sid, users[p], groupId, seasonId, g < (pl.goals ?? 0) ? 1 : 0, pl.rating, g < (pl.motm ?? 0)]);
    }
  }
  return { host, users, groupId, seasonId };
}

describe('ranked seasons', () => {
  it('Player of the Season: rating plus MOTM and attendance, half the games to qualify', async () => {
    // 8 games: need 4 to qualify
    const { host, users, seasonId } = await season(8, [
      { apps: 8, rating: 7.6, motm: 3, goals: 5 }, // 7.6 + 1.5*3/8 + 0.5*8/8 = 8.66
      { apps: 4, rating: 7.9, motm: 0 },           // 7.9 + 0 + 0.25 = 8.15
      { apps: 3, rating: 9.5, motm: 3, goals: 3 }, // too few games: not eligible for anything
    ]);
    await db.rpc(host, 'finalise_season', { p_season: seasonId });
    const awards = await db.admin(`select award, user_id, value::float v from season_awards where season_id = $1 order by award`, [seasonId]);
    const pots = awards.find((a) => a.award === 'player_of_season');
    expect(pots).toMatchObject({ user_id: users[0], v: 8.66 });
    expect(awards.some((a) => a.user_id === users[2])).toBe(false);
    expect(awards.find((a) => a.award === 'golden_boot')?.user_id).toBe(users[0]);
    // the medal has one name now, and the winner gets it
    expect((await db.admin(`select name from achievements where code = 'season_champion'`))[0].name).toBe('Player of the Season');
    expect(await db.admin(`select 1 from player_achievements where user_id = $1 and achievement_code = 'season_champion'`, [users[0]])).toHaveLength(1);
    // everyone in the group hears it's over
    expect(await db.admin(`select 1 from notifications where user_id = $1 and type = 'season_ended'`, [users[1]])).toHaveLength(1);
  });

  it('fewer than 7 games: no awards that season', async () => {
    const { host, seasonId } = await season(6, [{ apps: 6, rating: 8, motm: 4 }]);
    await db.rpc(host, 'finalise_season', { p_season: seasonId });
    expect(await db.admin(`select 1 from season_awards where season_id = $1`, [seasonId])).toHaveLength(0);
    expect((await db.admin(`select status, awarded, games from seasons where id = $1`, [seasonId]))[0]).toEqual({ status: 'completed', awarded: false, games: 6 });
  });

  it('seasons finish by themselves 3 days after they end; players see the countdown and results', async () => {
    const { users, seasonId, groupId } = await season(7, [{ apps: 7, rating: 7, motm: 2 }]);
    // pretend this season ended last month
    await db.admin(`update seasons set starts_on = current_date - 120, ends_on = current_date - 10 where id = $1`, [seasonId]);
    expect((await db.admin(`select public.run_season_rollover() n`))[0].n).toBeGreaterThanOrEqual(1);
    expect((await db.admin(`select status from seasons where id = $1`, [seasonId]))[0].status).toBe('completed');
    const mine = await db.rpc<any>(users[0], 'get_my_seasons');
    expect(mine.current.name).toMatch(/^(Winter|Spring|Summer|Autumn) \d{4}$/);
    expect(mine.groups.find((g: any) => g.group_id === groupId)).toMatchObject({ needed: 7 });
    const result = mine.results.find((r: any) => r.season_id === seasonId);
    expect(result.winners[0]).toMatchObject({ user_id: users[0] });
    // only admins (or the daily job) can finish one early
    await expectAppError(db.rpc(users[0], 'finalise_season', { p_season: seasonId }), 'forbidden');
  });
});
