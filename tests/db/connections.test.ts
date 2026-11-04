/** Partners and rivals: computed from real line-ups and results. */
import { Db, uniq } from './helpers';

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
