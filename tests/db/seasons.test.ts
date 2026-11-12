/** Ranked seasons: quarterly, automatic, 7+ games for awards, half the games to qualify, a fair formula. */
import { Db, expectAppError, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

// a group with `games` finalised games this season, and each player's season in numbers
async function season(games: number, players: { apps: number; rating: number; motm?: number; goals?: number }[], day = 'current_date') {
  const host = await db.createUser(uniq('sh'));
  const users: string[] = [];
  for (let i = 0; i < players.length; i++) users.push(await db.createUser(uniq('sp')));
  const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Ranked FC', p_join_policy: 'open', p_visibility: 'private' });
  for (const u of users) await db.admin(`insert into group_members (group_id, user_id) values ($1, $2) on conflict do nothing`, [groupId, u]);
  const [{ id: seasonId }] = await db.admin(`select public.ensure_group_season($1, ${day}) id`, [groupId]);
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

describe('season race and nudges', () => {
  it('get_season_race: live table with the same formula, eligible players ranked', async () => {
    const { users, groupId } = await season(8, [
      { apps: 8, rating: 7.6, motm: 3 },
      { apps: 4, rating: 7.9 },
      { apps: 3, rating: 9.5, motm: 3 },
    ]);
    const race = await db.rpc<any>(users[1], 'get_season_race', { p_group: groupId });
    expect(race).toMatchObject({ games: 8, needed: 7, min_apps: 4 });
    expect(race.rows.map((r: any) => [r.user_id, r.rank, Number(r.score), r.eligible])).toEqual([
      [users[0], 1, 8.66, true], [users[1], 2, 8.15, true], [users[2], null, 11.19, false],
    ]);
    const outsider = await db.createUser(uniq('so'));
    await expectAppError(db.rpc(outsider, 'get_season_race', { p_group: groupId }), 'forbidden');
  });

  it('run_season_nudges: once, two weeks out, the right message for each member', async () => {
    const { users, groupId, seasonId } = await season(8, [
      { apps: 8, rating: 7.6 }, { apps: 2, rating: 7 }, { apps: 6, rating: 6 }, { apps: 5, rating: 5 }, { apps: 7, rating: 4 },
    ]);
    // the season ends in 10 days
    await db.admin(`update seasons set ends_on = current_date + 10 where id = $1`, [seasonId]);
    await db.admin(`select public.run_season_nudges()`);
    const notes = await db.admin(`select user_id, title from notifications where type = 'season_nudge' and data->>'group_id' = $1`, [groupId]);
    const t = (u: string) => notes.filter((n) => n.user_id === u).map((n) => n.title);
    expect(t(users[0])).toEqual(['You’re top of the race']);
    expect(t(users[2])).toEqual(['You’re 2nd in the race']);
    expect(t(users[3])).toEqual(['You’re 3rd in the race']);
    expect(t(users[1])).toEqual(['Play 2 more to be in the running']);
    expect(t(users[4])).toEqual([]); // 4th: nothing to say
    await db.admin(`select public.run_season_nudges()`);
    const again = await db.admin(`select count(*)::int n from notifications where type = 'season_nudge' and data->>'group_id' = $1`, [groupId]);
    expect(again[0].n).toBe(notes.length);
  });

  it('run_season_nudges: a group short of 7 games hears how many it needs', async () => {
    const { users, groupId, seasonId } = await season(4, [{ apps: 4, rating: 7 }]);
    await db.admin(`update seasons set ends_on = current_date + 14 where id = $1`, [seasonId]);
    await db.admin(`select public.run_season_nudges()`);
    const notes = await db.admin(`select title, body from notifications where type = 'season_nudge' and user_id = $1`, [users[0]]);
    expect(notes).toEqual([{ title: 'Ranked FC needs 3 more games', body: expect.stringMatching(/^two weeks left of .+\. Awards need 7 games in a season\.$/) }]);
  });
});

describe('season badges', () => {
  const badges = (users: string[]) => db.admin(`select user_id, code, tier from season_badges where user_id = any($1)`, [users]);
  const codeOf = (rows: any[], u: string) => rows.find((r) => r.user_id === u)?.code ?? null;

  it('Pre-season: everyone who played gets the one-off badge, and it goes on their card', async () => {
    const { host, users, seasonId } = await season(3, [{ apps: 3, rating: 7 }, { apps: 1, rating: 6 }]);
    await db.rpc(host, 'finalise_season', { p_season: seasonId });
    const rows = await badges(users);
    expect(rows.map((r) => [codeOf(rows, r.user_id), r.tier])).toEqual([['pre', 'preseason'], ['pre', 'preseason']]);
    const [p] = await db.admin(`select card_season from profiles where id = $1`, [users[1]]);
    expect(p.card_season).toBe('pre');
  });

  it('Season 1: Champion, Elite, Contender, Regular and Squad by where you finished', async () => {
    // 8 games, 13 players: 10 qualify (8 games each, ratings 9.0 down to 6.3), two play 3 (Squad), one plays 1 (nothing)
    const players = [
      ...Array.from({ length: 10 }, (_, i) => ({ apps: 8, rating: 9 - i * 0.3 })),
      { apps: 3, rating: 9.9 }, { apps: 3, rating: 5 }, { apps: 1, rating: 8 },
    ];
    const { host, users, seasonId } = await season(8, players, "date '2027-02-01'");
    await db.rpc(host, 'finalise_season', { p_season: seasonId });
    const rows = await badges(users);
    expect(users.map((u) => codeOf(rows, u))).toEqual([
      's1_champion', 's1_elite', 's1_elite', 's1_contender', 's1_contender',
      's1_regular', 's1_regular', 's1_regular', 's1_regular', 's1_regular',
      's1_squad', 's1_squad', null,
    ]);
    const label = await db.admin(`select public.season_label(date '2027-04-01') a, public.season_label(date '2026-11-01') b`);
    expect(label[0]).toEqual({ a: 'Season 2', b: 'Pre-season' });
  });

  it('fewer than 10 players: no ranked badges (Squad only), though Player of the Season is still awarded', async () => {
    const { host, users, seasonId } = await season(8, Array.from({ length: 9 }, (_, i) => ({ apps: 8, rating: 8 - i * 0.2 })), "date '2027-02-01'");
    await db.rpc(host, 'finalise_season', { p_season: seasonId });
    const rows = await badges(users);
    expect(new Set(users.map((u) => codeOf(rows, u)))).toEqual(new Set(['s1_squad']));
    const pots = await db.admin(`select user_id from season_awards where season_id = $1 and award = 'player_of_season'`, [seasonId]);
    expect(pots).toEqual([{ user_id: users[0] }]);
  });

  it('keeps your best badge of the season; you can pick yours or none, and then it stays put', async () => {
    const u = await db.createUser(uniq('sb'));
    const q = '2027-01-01';
    for (const tier of ['squad', 'elite', 'contender']) await db.admin(`select public.give_season_badge($1, $2, $3, null, null)`, [u, q, tier]);
    expect((await badges([u])).map((r) => r.code)).toEqual(['s1_elite']);
    expect((await db.admin(`select card_season from profiles where id = $1`, [u]))[0].card_season).toBe('s1_elite');
    await expectAppError(db.rpc(u, 'set_card_season', { p_code: 's1_champion' }), 'title_locked');
    await db.rpc(u, 'set_card_season', { p_code: null });
    await db.admin(`select public.give_season_badge($1, '2027-04-01', 'champion', null, null)`, [u]);
    expect((await db.admin(`select card_season from profiles where id = $1`, [u]))[0].card_season).toBeNull();
    // each badge unlocks its title; others stay locked
    await db.rpc(u, 'set_card_title', { p_title: 'season:s2_champion' });
    expect((await db.admin(`select card_title from profiles where id = $1`, [u]))[0].card_title).toBe('season:s2_champion');
    await expectAppError(db.rpc(u, 'set_card_title', { p_title: 'season:s1_champion' }), 'title_locked');
    await db.rpc(u, 'set_card_title', { p_title: 'weekend_warrior' });
    await db.rpc(u, 'set_card_season', { p_code: 's2_champion' });
    expect((await db.admin(`select card_season from profiles where id = $1`, [u]))[0].card_season).toBe('s2_champion');
  });
});
