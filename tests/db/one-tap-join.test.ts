/** Joining from a WhatsApp link: one tap gets a new player into the game, and into the group. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function groupGame(joinPolicy: 'open' | 'request' | 'invite_only') {
  const host = await db.createUser(uniq('oh'));
  const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Tap FC', p_join_policy: joinPolicy, p_visibility: 'private' });
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Tap FC', group_id: groupId, visibility: 'group', starts_at: new Date(Date.now() + 20 * 3600_000).toISOString(), format_size: 5, max_attendance: 10 },
  });
  return { host, groupId, sid };
}

describe('one-tap join', () => {
  it("the host's game link: I'm in, and in the group, in one go", async () => {
    const { host, groupId, sid } = await groupGame('invite_only');
    const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'session', p_target: sid });
    const player = await db.createUser(uniq('op'));
    const r = await db.rpc<any>(player, 'join_via_invite', { p_code: code });
    expect(r).toMatchObject({ kind: 'session', target_id: sid, result: 'invited', joined_group: true, status: 'confirmed' });
    const [m] = await db.admin(`select count(*)::int n from group_members where group_id = $1 and user_id = $2`, [groupId, player]);
    expect(m.n).toBe(1);
  });

  it("a player's shared link (bring a mate) gets the mate into the game, not the group", async () => {
    const { host, groupId, sid } = await groupGame('invite_only');
    const member = await db.createUser(uniq('om'));
    await db.admin(`insert into group_members (group_id, user_id) values ($1, $2)`, [groupId, member]);
    await db.rpc(member, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    await db.rpc(host, 'set_players_can_invite', { p_session: sid, p_on: true });
    const code = await db.rpc<string>(member, 'create_invite_link', { p_kind: 'session', p_target: sid });
    const mate = await db.createUser(uniq('omate'));
    const r = await db.rpc<any>(mate, 'join_via_invite', { p_code: code });
    expect(r).toMatchObject({ joined_group: false, status: 'confirmed' });
  });

  it('someone removed from the group is not brought back by a game link', async () => {
    const { host, groupId, sid } = await groupGame('open');
    const player = await db.createUser(uniq('orem'));
    await db.admin(`insert into group_members (group_id, user_id) values ($1, $2)`, [groupId, player]);
    await db.rpc(host, 'remove_group_member', { p_group: groupId, p_user: player, p_reason: null }).catch(async () => {
      await db.admin(`delete from group_members where group_id = $1 and user_id = $2`, [groupId, player]);
      await db.admin(`insert into group_removals (group_id, user_id, removed_by) values ($1, $2, $3)`, [groupId, player, host]);
    });
    const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'session', p_target: sid });
    const r = await db.rpc<any>(player, 'accept_invite', { p_code: code });
    expect(r.joined_group).toBe(false);
  });
});

describe('match report nudge', () => {
  it('the host hears the match report is ready when the game is finalised', async () => {
    const { host, sid } = await groupGame('open');
    await db.admin(`update sessions set status = 'completed' where id = $1`, [sid]);
    await db.admin(`update sessions set status = 'finalised', finalised_at = now() where id = $1`, [sid]);
    const n = await db.admin(`select title, body, data->>'session_id' sid from notifications where user_id = $1 and type = 'share_results'`, [host]);
    expect(n).toEqual([{ title: 'Your match report is ready', body: expect.stringMatching(/^Score, (Man of the Match|Player of the Night|Player of the Day), scorers/), sid }]);
  });
});

describe('one-tap join edge cases (audit)', () => {
  it('a full game puts the new player on the waiting list, never over capacity', async () => {
    const host = await db.createUser(uniq('fh'));
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Full FC', starts_at: new Date(Date.now() + 48 * 3600_000).toISOString(), format_size: 5, max_attendance: 2, visibility: 'public' } });
    const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'session', p_target: sid });
    const a = await db.createUser(uniq('fa'));
    const b = await db.createUser(uniq('fb'));
    expect((await db.rpc<any>(a, 'join_via_invite', { p_code: code })).status).toBe('confirmed');
    expect((await db.rpc<any>(b, 'join_via_invite', { p_code: code })).status).toBe('waitlisted');
    const [n] = await db.admin(`select count(*)::int c from session_attendance where session_id = $1 and status = 'confirmed'`, [sid]);
    expect(n.c).toBe(2);
  });

  it('a cancelled game refuses, and leaves nothing half-done (no invite, no group membership)', async () => {
    const { host, groupId, sid } = await groupGame('invite_only');
    const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'session', p_target: sid });
    await db.admin(`update sessions set status = 'cancelled' where id = $1`, [sid]);
    const p = await db.createUser(uniq('fc'));
    await expect(db.rpc(p, 'join_via_invite', { p_code: code })).rejects.toBeTruthy();
    const [x] = await db.admin(`select (select count(*)::int from session_invitations where session_id = $1 and user_id = $3) inv,
      (select count(*)::int from group_members where group_id = $2 and user_id = $3) mem`, [sid, groupId, p]);
    expect(x).toEqual({ inv: 0, mem: 0 });
  });
});
