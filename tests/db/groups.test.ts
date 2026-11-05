/** Groups end to end: invitations, leaving, removing, re-inviting, and group games around them. */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

const member = async (g: string, u: string) => (await db.admin(`select public.is_group_member($1, $2) m`, [g, u]))[0].m as boolean;
const attendance = async (sid: string, u: string) => (await db.admin(`select status from session_attendance where session_id = $1 and user_id = $2`, [sid, u]))[0]?.status ?? null;

async function groupWith(n: number, policy: 'request' | 'invite_only' | 'open' = 'request') {
  const owner = await db.createUser(uniq('go'));
  const people: string[] = [];
  for (let i = 0; i < n; i++) people.push(await db.createUser(uniq(`gm${i}`)));
  for (const p of people) await db.befriend(owner, p);
  const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Squad FC', p_visibility: 'private', p_join_policy: policy });
  await db.rpc(owner, 'add_group_members', { p_group: g, p_users: people });
  for (const p of people) expect(await db.rpc(p, 'respond_group_invite', { p_group: g, p_accept: true })).toBe('joined');
  return { owner, people, g };
}

describe('group invitations', () => {
  it('shows pending invites, and the player accepts or declines', async () => {
    const owner = await db.createUser(uniq('io'));
    const [a, b] = [await db.createUser(uniq('ia')), await db.createUser(uniq('ib'))];
    for (const u of [a, b]) await db.befriend(owner, u);
    const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Invite FC', p_visibility: 'private', p_join_policy: 'invite_only' });
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [a, b] })).toBe(2);

    const invites = await db.rpc<any[]>(a, 'get_my_group_invites');
    expect(invites).toEqual([expect.objectContaining({ group_id: g, name: 'Invite FC', members: 1 })]);
    // a private group stays hidden until they join
    expect(await db.as(a, `select id from groups where id = $1`, [g])).toHaveLength(0);

    expect(await db.rpc(a, 'respond_group_invite', { p_group: g, p_accept: true })).toBe('joined');
    expect(await member(g, a)).toBe(true);
    expect((await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'group_invite_accepted'`, [owner]))[0].n).toBe(1);
    expect(await db.rpc(b, 'respond_group_invite', { p_group: g, p_accept: false })).toBe('declined');
    expect(await member(g, b)).toBe(false);
    expect(await db.rpc<any[]>(b, 'get_my_group_invites')).toEqual([]);
    await expectAppError(db.rpc(b, 'respond_group_invite', { p_group: g, p_accept: true }), 'not_found');

    // invite again after declining, then the owner withdraws it
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [b] })).toBe(1);
    await db.rpc(owner, 'cancel_group_invite', { p_group: g, p_user: b });
    await expectAppError(db.rpc(b, 'respond_group_invite', { p_group: g, p_accept: true }), 'not_found');
  });

  it('an admin inviting someone who already asked to join lets them straight in', async () => {
    const owner = await db.createUser(uniq('ro'));
    const asker = await db.createUser(uniq('ra'));
    await db.befriend(owner, asker);
    const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Asked FC', p_visibility: 'public', p_join_policy: 'request' });
    expect(await db.rpc(asker, 'join_group', { p_group: g })).toBe('requested');
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [asker] })).toBe(1);
    expect(await member(g, asker)).toBe(true);
  });
});

describe('leaving and removing', () => {
  it('members can leave; the owner has to hand the group over first', async () => {
    const { owner, people: [a, b], g } = await groupWith(2);
    await db.rpc(a, 'remove_group_member', { p_group: g, p_user: a });
    expect(await member(g, a)).toBe(false);
    // leaving isn't a removal: they can be invited back by anyone and come back
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [a] })).toBe(1);
    expect(await db.rpc(a, 'respond_group_invite', { p_group: g, p_accept: true })).toBe('joined');

    await expectAppError(db.rpc(owner, 'remove_group_member', { p_group: g, p_user: owner }), 'owner_cannot_leave');
    await db.rpc(owner, 'transfer_group_ownership', { p_group: g, p_new_owner: b });
    await db.rpc(owner, 'remove_group_member', { p_group: g, p_user: owner });
    expect(await member(g, owner)).toBe(false);
    expect((await db.admin(`select role from group_members where group_id = $1 and user_id = $2`, [g, b]))[0].role).toBe('owner');
  });

  it('only the owner or admins can remove, and not someone above them', async () => {
    const { owner, people: [admin, m1, m2], g } = await groupWith(3);
    await db.rpc(owner, 'set_member_role', { p_group: g, p_user: admin, p_role: 'admin' });
    await expectAppError(db.rpc(m1, 'remove_group_member', { p_group: g, p_user: m2 }), 'forbidden');
    await expectAppError(db.rpc(admin, 'remove_group_member', { p_group: g, p_user: owner }), 'forbidden');
    await db.rpc(admin, 'remove_group_member', { p_group: g, p_user: m1, p_reason: 'Abusive in the chat' });
    expect(await member(g, m1)).toBe(false);
    const [n] = await db.admin(`select body from notifications where user_id = $1 and type = 'group_removed'`, [m1]);
    expect(n.body).toContain('Abusive in the chat');
  });

  it('a removed player is taken off the group’s upcoming games and can only come back if an admin invites them', async () => {
    const { owner, people: [kicked, regular, waiting, friendOfKicked], g } = await groupWith(4);
    const sid = await db.rpc<string>(owner, 'create_session', {
      p: { name: 'Group game', starts_at: new Date(Date.now() + 3 * 86400_000).toISOString(), format_size: 5, group_id: g, visibility: 'group' },
    });
    await db.admin(`update sessions set max_attendance = 3 where id = $1`, [sid]); // owner + 2
    expect(await db.rpc(kicked, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    expect(await db.rpc(regular, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    expect(await db.rpc(waiting, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('waitlisted');

    await db.rpc(owner, 'remove_group_member', { p_group: g, p_user: kicked });
    expect(await attendance(sid, kicked)).toBe('removed');
    // their place went to the waiting list (more than 24h out: straight in)
    expect(await attendance(sid, waiting)).toBe('confirmed');
    const [n] = await db.admin(`select body from notifications where user_id = $1 and type = 'group_removed'`, [kicked]);
    expect(n.body).toContain('taken off the group’s upcoming game');

    // they can't get back in by themselves, or via a regular member
    await expectAppError(db.rpc(kicked, 'respond_to_session', { p_session: sid, p_response: 'confirmed' }), 'removed');
    await db.befriend(friendOfKicked, kicked);
    expect(await db.rpc<number>(friendOfKicked, 'add_group_members', { p_group: g, p_users: [kicked] })).toBe(0);
    // an admin invites them back; they accept
    await db.rpc(owner, 'readmit_group_member', { p_group: g, p_user: kicked });
    expect(await member(g, kicked)).toBe(false);
    expect(await db.rpc(kicked, 'respond_group_invite', { p_group: g, p_accept: true })).toBe('joined');
  });

  it('leaving voluntarily keeps games you already said yes to', async () => {
    const { owner, people: [a], g } = await groupWith(1);
    const sid = await db.rpc<string>(owner, 'create_session', {
      p: { name: 'Group game', starts_at: new Date(Date.now() + 3 * 86400_000).toISOString(), format_size: 5, group_id: g, visibility: 'group' },
    });
    await db.rpc(a, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    await db.rpc(a, 'remove_group_member', { p_group: g, p_user: a });
    expect(await attendance(sid, a)).toBe('confirmed');
  });
});

describe('group games', () => {
  it('only members (or invited players) can join a group game', async () => {
    const { owner, people: [m], g } = await groupWith(1);
    const outsider = await db.createUser(uniq('out'));
    await db.befriend(owner, outsider);
    const sid = await db.rpc<string>(owner, 'create_session', {
      p: { name: 'Members only', starts_at: new Date(Date.now() + 3 * 86400_000).toISOString(), format_size: 5, group_id: g, visibility: 'group' },
    });
    expect(await db.rpc(m, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    await expect(db.rpc(outsider, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).rejects.toThrow();
    // the host can still invite a non-member
    await db.rpc(owner, 'invite_to_session', { p_session: sid, p_users: [outsider] });
    expect(await db.rpc(outsider, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
  });
});
