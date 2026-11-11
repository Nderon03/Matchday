/** Bring a mate: players share the game link (open games, or closed games the host opened up). */
import { Db, expectAppError, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function game(visibility: 'public' | 'private') {
  const host = await db.createUser(uniq('bh'));
  const player = await db.createUser(uniq('bp'));
  await db.befriend(host, player);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Mates FC', starts_at: new Date(Date.now() + 20 * 3600_000).toISOString(), format_size: 5, max_attendance: 10, visibility, invitee_ids: [player] },
  });
  await db.rpc(player, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  return { host, player, sid };
}

describe('bring a mate', () => {
  it('open game: a player shares the link; the mate joins straight in, and the player hears about it', async () => {
    const { player, sid } = await game('public');
    const code = await db.rpc<string>(player, 'create_invite_link', { p_kind: 'session', p_target: sid });
    const mate = await db.createUser(uniq('mate'));
    await db.rpc(mate, 'accept_invite', { p_code: code });
    expect(await db.rpc(mate, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    const [n] = await db.admin(`select title from notifications where user_id = $1 and type = 'mate_joined'`, [player]);
    expect(n.title).toMatch(/is on MATCHDAY/);
  });

  it('closed game: only once the host allows it, and an old link stops when switched off', async () => {
    const { host, player, sid } = await game('private');
    await expectAppError(db.rpc(player, 'create_invite_link', { p_kind: 'session', p_target: sid }), 'forbidden');
    await expectAppError(db.rpc(player, 'set_players_can_invite', { p_session: sid, p_on: true }), 'forbidden');
    await db.rpc(host, 'set_players_can_invite', { p_session: sid, p_on: true });
    const code = await db.rpc<string>(player, 'create_invite_link', { p_kind: 'session', p_target: sid });
    await db.rpc(host, 'set_players_can_invite', { p_session: sid, p_on: false });
    const mate = await db.createUser(uniq('mate2'));
    await expectAppError(db.rpc(mate, 'accept_invite', { p_code: code }), 'invite_expired');
  });

  it('a closed game not full a day before kick-off asks the host, once', async () => {
    const { host, sid } = await game('private');
    expect((await db.admin(`select public.nudge_bring_a_mate() n`))[0].n).toBeGreaterThanOrEqual(1);
    const rows = await db.admin(`select title from notifications where user_id = $1 and type = 'bring_mate_nudge' and data->>'session_id' = $2`, [host, sid]);
    expect(rows).toEqual([{ title: 'Mates FC is 8 short' }]);
    await db.admin(`select public.nudge_bring_a_mate()`);
    expect(await db.admin(`select 1 from notifications where user_id = $1 and type = 'bring_mate_nudge' and data->>'session_id' = $2`, [host, sid])).toHaveLength(1);
  });
});
