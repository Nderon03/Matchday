/** Partners and rivals: computed from real line-ups and results. */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

/** One session with several games between team A and team B, finalised. Scores are [A, B]. */
async function play(host: string, a: string[], b: string[], scores: [number, number][]) {
  const all = [...a, ...b].filter((u) => u !== host);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Rivals FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, invitee_ids: all, mode: 'multi' },
  });
  for (const u of all) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  for (let i = 0; i < scores.length; i++) {
    const fid = i === 0 ? (await db.admin(`select id from fixtures where session_id = $1`, [sid]))[0].id : await db.rpc<string>(host, 'add_fixture', { p_session: sid });
    await db.rpc(host, 'save_lineup', { p_fixture: fid, p_teams: { A: { players: a.map((user_id) => ({ user_id })) }, B: { players: b.map((user_id) => ({ user_id })) } } });
    await db.rpc(host, 'record_fixture_score', { p_fixture: fid, p_score_a: scores[i][0], p_score_b: scores[i][1] });
  }
  await db.rpc(host, 'complete_session', { p_session: sid });
  await db.admin(`update session_attendance set verification = 'verified' where session_id = $1 and status = 'confirmed'`, [sid]);
  await db.rpc(host, 'finalise_session', { p_session: sid });
}

describe('partners and rivals', () => {
  it('finds who you win with and who keeps beating you', async () => {
    const [me, mate, rival, other] = [await db.createUser(uniq('me')), await db.createUser(uniq('mate')), await db.createUser(uniq('riv')), await db.createUser(uniq('oth'))];
    for (const u of [mate, rival, other]) await db.befriend(me, u);
    // me + mate vs rival + other: we lose 4 of 5
    await play(me, [me, mate], [rival, other], [[0, 1], [1, 2], [0, 3], [2, 1], [1, 4]]);
    // me + other vs rival + mate: we win 5 of 6 games... but lose to the rival twice more
    await play(me, [me, other], [rival, mate], [[3, 0], [2, 0], [4, 1], [1, 0], [2, 1], [0, 2]]);

    const c = await db.rpc<any>(me, 'get_player_connections', { p_user: me });
    // partner: other won 5 of 6 with me (83%), better than mate's 1 of 5
    expect(c.partner).toMatchObject({ games: 6, wins: 5, win_pct: 83, player: { id: other } });
    // nemesis: other also beat me 4 of 5 when on the other side; the rival is 6 wins 5 losses, so isn't one
    expect(c.nemesis).toMatchObject({ player: { id: other }, games: 5, losses: 4, wins: 1 });

    // others see the same (friends can see stats), and a stranger with a private profile sees nothing
    expect((await db.rpc<any>(mate, 'get_player_connections', { p_user: me })).partner.player.id).toBe(other);
  });

  it('respects privacy', async () => {
    const me = await db.createUser(uniq('pv'));
    const stranger = await db.createUser(uniq('ps'));
    await db.admin(`update user_preferences set profile_visibility = 'private', show_stats = false where user_id = $1`, [me]);
    expect(await db.rpc(stranger, 'get_player_connections', { p_user: me })).toBeNull();
    expect(await db.rpc(me, 'get_player_connections', { p_user: me })).toEqual({ partner: null, nemesis: null });
  });
});

describe('link-ups', () => {
  it('ranks teammates by win rate together, with the lift over your usual rate', async () => {
    const [me, mate, rival, other] = [await db.createUser(uniq('lu')), await db.createUser(uniq('lm')), await db.createUser(uniq('lr')), await db.createUser(uniq('lo'))];
    for (const u of [mate, rival, other]) await db.befriend(me, u);
    // me + mate win 1 of 5; me + other win 5 of 6 (as in the partners test)
    await play(me, [me, mate], [rival, other], [[0, 1], [1, 2], [0, 3], [2, 1], [1, 4]]);
    await play(me, [me, other], [rival, mate], [[3, 0], [2, 0], [4, 1], [1, 0], [2, 1], [0, 2]]);

    const l = await db.rpc<any>(me, 'get_player_linkups', { p_user: me });
    // overall: 6 wins from 11 games = 55%
    expect(l).toMatchObject({ games: 11, win_pct: 55 });
    expect(l.linkups.map((x: any) => x.player.id)).toEqual([other, mate]);
    expect(l.linkups[0]).toMatchObject({ games: 6, wins: 5, draws: 0, losses: 1, win_pct: 83, lift: 28 });
    expect(l.linkups[1]).toMatchObject({ games: 5, wins: 1, losses: 4, win_pct: 20, lift: -35 });
    // the rival never played on my side
    expect(l.linkups.find((x: any) => x.player.id === rival)).toBeUndefined();
    // blocked players drop out of the list
    await db.admin(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [me, mate]);
    expect((await db.rpc<any>(me, 'get_player_linkups', { p_user: me })).linkups.map((x: any) => x.player.id)).toEqual([other]);
    await db.admin(`delete from user_blocks where blocker_id = $1`, [me]);
  });

  it('only counts games in a group when asked, and needs 3 together', async () => {
    const [me, mate, rival, other] = [await db.createUser(uniq('lg')), await db.createUser(uniq('lh')), await db.createUser(uniq('li')), await db.createUser(uniq('lj'))];
    for (const u of [mate, rival, other]) await db.befriend(me, u);
    await play(me, [me, mate], [rival, other], [[2, 0], [1, 0]]);
    expect((await db.rpc<any>(me, 'get_player_linkups', { p_user: me })).linkups).toEqual([]);
    const groupId = await db.rpc<string>(me, 'create_group', { p_name: 'Empty FC' });
    expect(await db.rpc<any>(me, 'get_player_linkups', { p_user: me, p_group: groupId })).toMatchObject({ games: 0, win_pct: 0, linkups: [] });
  });

  it('respects privacy', async () => {
    const me = await db.createUser(uniq('lp'));
    const stranger = await db.createUser(uniq('ls'));
    await db.admin(`update user_preferences set profile_visibility = 'private', show_stats = false where user_id = $1`, [me]);
    expect(await db.rpc(stranger, 'get_player_linkups', { p_user: me })).toBeNull();
  });
});

describe('best duos', () => {
  it('finds the pairs in a group who win most together, for members only', async () => {
    const [host, a, b, c] = [await db.createUser(uniq('dh')), await db.createUser(uniq('da')), await db.createUser(uniq('db')), await db.createUser(uniq('dc'))];
    for (const u of [a, b, c]) await db.befriend(host, u);
    const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Duos FC' });
    for (const u of [a, b, c]) await db.admin(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [groupId, u]);
    // host + a win all 4; b + c lose all 4
    await play(host, [host, a], [b, c], [[1, 0], [2, 0], [3, 1], [1, 0]]);
    await db.admin(`update sessions set group_id = $2 where host_id = $1`, [host, groupId]);
    const duos = await db.rpc<any[]>(b, 'get_group_duos', { p_group: groupId });
    expect(duos).toHaveLength(1);
    expect([duos[0].a.id, duos[0].b.id].sort()).toEqual([host, a].sort());
    expect(duos[0]).toMatchObject({ games: 4, wins: 4, losses: 0, win_pct: 100 });
    const outsider = await db.createUser(uniq('do'));
    await expectAppError(db.rpc(outsider, 'get_group_duos', { p_group: groupId }), 'forbidden');
  });
});

describe('team of the month candidates', () => {
  it('gives group members the month’s numbers, and nobody else', async () => {
    const host = await db.createUser(uniq('tm'));
    const p = await db.createUser(uniq('tp'));
    const outsider = await db.createUser(uniq('to'));
    const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Monthly FC' });
    await db.admin(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [groupId, p]);
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Month game', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, group_id: groupId } });
    await db.admin(`update sessions set status = 'finalised', starts_at = now() where id = $1`, [sid]);
    await db.admin(`insert into session_player_statistics (session_id, user_id, group_id, played_at, fixtures_played, goals, rating_avg, rating_eligible, motm)
                    values ($1, $2, $3, now(), 1, 2, 7.5, true, true)`, [sid, p, groupId]);
    const r = await db.rpc<any>(host, 'get_month_candidates', { p_group: groupId, p_month: new Date().toISOString().slice(0, 10) });
    expect(r.sessions).toBe(1);
    expect(r.players).toEqual([expect.objectContaining({ user_id: p, rated: 1, goals: 2, motm: 1, apps: 1 })]);
    await expectAppError(db.rpc(outsider, 'get_month_candidates', { p_group: groupId, p_month: new Date().toISOString().slice(0, 10) }), 'forbidden');
  });
});
