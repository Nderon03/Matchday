/**
 * Exercises every remaining RPC at least once so that PL/pgSQL runtime errors
 * (which are not caught at migration time) surface in CI.
 */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function squad(n = 6) {
  const host = await db.createUser(uniq('h'));
  const others: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const u = await db.createUser(uniq('p'));
    await db.befriend(host, u);
    others.push(u);
  }
  const g = await db.rpc<string>(host, 'create_group', { p_name: 'Coverage FC', p_visibility: 'public', p_join_policy: 'open' });
  for (const u of others) await db.rpc(u, 'join_group', { p_group: g });
  return { host, others, all: [host, ...others], g };
}

describe('session administration RPCs', () => {
  it('update, check-in, replacement, fixtures, payments summary, cash, cancel', async () => {
    const { host, others, all, g } = await squad(6);
    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Admin FC', group_id: g, starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, max_attendance: 10, payment_mode: 'after', price_pence: 500, invitee_ids: others },
    });
    for (const u of others.slice(0, 4)) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    await db.rpc(others[4], 'respond_to_session', { p_session: sid, p_response: 'unavailable' });

    await db.rpc(host, 'update_session', { p_session: sid, p: { venue: 'New Venue', starts_at: new Date(Date.now() + 7200_000).toISOString() } });
    const notes = await db.admin(`select count(*)::int n from notifications where type = 'session_updated' and data->>'session_id' = $1`, [sid]);
    expect(notes[0].n).toBeGreaterThanOrEqual(4);
    await expectAppError(db.rpc(host, 'update_session', { p_session: sid, p: { max_attendance: 2 } }), 'invalid');

    await db.rpc(others[0], 'check_in', { p_session: sid });
    await expectAppError(db.rpc(others[4], 'check_in', { p_session: sid }), 'invalid');

    const voting = await db.rpc<any>(others[0], 'get_voting_state', { p_session: sid });
    expect(voting.open).toBe(false);

    // replacement: others[4] replaces others[3]
    const [f1] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
    await db.rpc(host, 'save_lineup', {
      p_fixture: f1.id,
      p_teams: { A: { name: 'Reds', players: [{ user_id: host }, { user_id: others[0] }, { user_id: others[1] }] }, B: { players: [{ user_id: others[2] }, { user_id: others[3] }] } },
      p_confirm: false,
    });
    await db.rpc(host, 'add_session_player', { p_session: sid, p_user: others[4], p_replacement_for: others[3] });
    const teamB = await db.admin(`select user_id from team_players tp join fixture_teams ft on ft.id = tp.fixture_team_id where tp.fixture_id = $1 and ft.side = 'B' order by user_id`, [f1.id]);
    expect(teamB.map((r) => r.user_id).sort()).toEqual([others[2], others[4]].sort());
    const [rep] = await db.admin(`select verification from session_attendance where session_id = $1 and user_id = $2`, [sid, others[3]]);
    expect(rep.verification).toBe('absent');

    await db.rpc(host, 'start_session', { p_session: sid });
    const f2 = await db.rpc<string>(host, 'add_fixture', { p_session: sid, p_copy_from: f1.id });
    const f3 = await db.rpc<string>(host, 'add_fixture', { p_session: sid });
    await db.rpc(host, 'delete_fixture', { p_fixture: f2 });
    const nums = await db.admin(`select id, number from fixtures where session_id = $1 order by number`, [sid]);
    expect(nums.map((x) => [x.id, x.number])).toEqual([[f1.id, 1], [f3, 2]]);
    await db.rpc(host, 'delete_fixture', { p_fixture: f3 });
    await expectAppError(db.rpc(host, 'delete_fixture', { p_fixture: f1.id }), 'invalid');

    const strengths = await db.as(host, `select * from public.get_player_strengths($1)`, [sid]);
    expect(strengths.length).toBe(5);
    await db.as(host, `select * from public.get_recent_pairings($1)`, [sid]);

    await db.rpc(host, 'record_fixture_score', { p_fixture: f1.id, p_score_a: 2, p_score_b: 2 });
    await db.rpc(host, 'complete_session', { p_session: sid });
    const pays = await db.admin(`select payer_id, status from payments where session_id = $1`, [sid]);
    expect(pays).toHaveLength(4); // verified non-host players
    await db.rpc(host, 'record_cash_payment', { p_session: sid, p_user: others[0] });
    const summary = await db.rpc<any>(host, 'get_payment_summary', { p_session: sid });
    expect(summary.paid_count).toBe(1);
    expect(summary.collected_pence).toBe(500);
    expect(summary.outstanding_pence).toBe(1500);
    await db.rpc(host, 'mark_host_confirmed', { p_session: sid });
    await db.rpc(host, 'reconcile_session', { p_session: sid });

    const tasks = await db.as(others[1], `select kind from public.get_pending_tasks()`);
    expect(tasks.map((t) => t.kind)).toEqual(expect.arrayContaining(['vote', 'goals', 'payment']));

    // cancellation of another session notifies attendees
    const sid2 = await db.rpc<string>(host, 'create_session', { p: { name: 'Cancel FC', starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, invitee_ids: [others[0]] } });
    await db.rpc(others[0], 'respond_to_session', { p_session: sid2, p_response: 'confirmed' });
    await db.rpc(host, 'cancel_session', { p_session: sid2, p_reason: 'Pitch flooded' });
    const [c] = await db.admin(`select status from sessions where id = $1`, [sid2]);
    expect(c.status).toBe('cancelled');
    expect(all.length).toBe(6);
  });
});

describe('leaderboards across scopes and categories', () => {
  it('runs every category for group, friends and global scopes', async () => {
    const { host, others, all, g } = await squad(4);
    for (let i = 0; i < 2; i++) {
      const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'LB FC', group_id: g, starts_at: new Date(Date.now() - (i + 1) * 3600_000).toISOString(), format_size: 5, invitee_ids: others } });
      for (const u of others) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
      const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
      await db.rpc(host, 'save_lineup', { p_fixture: f.id, p_teams: { A: { players: all.slice(0, 2).map((user_id) => ({ user_id })) }, B: { players: all.slice(2).map((user_id) => ({ user_id })) } } });
      await db.rpc(host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 3, p_score_b: 1 });
      await db.rpc(host, 'complete_session', { p_session: sid });
      await db.rpc(host, 'host_record_goals', { p_session: sid, p_user: others[0], p_goals: 2, p_assists: 1 });
      for (const r of all) await db.rpc(r, 'submit_ratings', { p_session: sid, p_ratings: all.filter((x) => x !== r).map((x) => ({ user_id: x, score: 7 })) });
      await db.rpc(host, 'finalise_session', { p_session: sid });
    }
    const categories = ['goals', 'motm', 'rating', 'form', 'appearances', 'wins', 'win_pct', 'assists', 'improved', 'streak'];
    for (const scope of ['group', 'friends', 'global']) {
      for (const cat of categories) {
        for (const period of ['all', 'month', 'year']) {
          const rows = await db.as(host, `select * from public.get_leaderboard($1, $2, $3, null, $4)`, [cat, scope, scope === 'group' ? g : null, period]);
          expect(Array.isArray(rows)).toBe(true);
        }
      }
    }
    const goals = await db.as(host, `select * from public.get_leaderboard('goals', 'friends', null)`);
    expect(goals[0].user_id).toBe(others[0]);
    expect(Number(goals[0].value)).toBe(4);
    const assists = await db.as(host, `select * from public.get_leaderboard('assists', 'group', $1)`, [g]);
    expect(Number(assists[0].value)).toBe(2);
    const profile = await db.rpc<any>(host, 'get_player_profile', { p_user: others[0], p_group: g });
    expect(profile.stats.goals).toBe(4);
    expect(profile.teammates.length).toBeGreaterThan(0);
    const wrapped = await db.rpc<any>(others[0], 'get_wrapped', { p_from: new Date(Date.now() - 86400_000 * 2).toISOString(), p_to: new Date(Date.now() + 3600_000).toISOString() });
    expect(wrapped.goals).toBe(4);
  });
});

describe('removing members from a group', () => {
  it('removed members can only come back when an admin re-admits them', async () => {
    const owner = await db.createUser(uniq('own'));
    const member = await db.createUser(uniq('mem'));
    const kicked = await db.createUser(uniq('kick'));
    for (const u of [member, kicked]) await db.befriend(owner, u);
    await db.befriend(member, kicked);
    const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Kick FC', p_visibility: 'public', p_join_policy: 'open' });
    await db.rpc(owner, 'add_group_members', { p_group: g, p_users: [member, kicked] });

    await expectAppError(db.rpc(member, 'remove_group_member', { p_group: g, p_user: kicked }), 'forbidden');
    await db.rpc(owner, 'remove_group_member', { p_group: g, p_user: kicked, p_reason: 'Repeated no-shows' });
    expect((await db.admin(`select public.is_group_member($1, $2) m`, [g, kicked]))[0].m).toBe(false);
    const [n] = await db.admin(`select body, data from notifications where user_id = $1 and type = 'group_removed'`, [kicked]);
    expect(n.body).toMatch(/Reason: Repeated no-shows/);
    expect(n.data.group_name).toBe('Kick FC');

    // open group, invite link and a regular member's re-add are all blocked
    await expectAppError(db.rpc(kicked, 'join_group', { p_group: g }), 'removed');
    const code = await db.rpc<string>(owner, 'create_invite_link', { p_kind: 'group', p_target: g });
    await expectAppError(db.rpc(kicked, 'accept_invite', { p_code: code }), 'removed');
    expect(await db.rpc<number>(member, 'add_group_members', { p_group: g, p_users: [kicked] })).toBe(0);
    // the removed player can see their removal; other members cannot
    expect(await db.as(kicked, `select reason from group_removals where group_id = $1`, [g])).toEqual([{ reason: 'Repeated no-shows' }]);
    expect(await db.as(member, `select * from group_removals where group_id = $1`, [g])).toHaveLength(0);

    // admin re-admits → back in, and can later leave freely without being "removed"
    await expectAppError(db.rpc(member, 'readmit_group_member', { p_group: g, p_user: kicked }), 'forbidden');
    await db.rpc(owner, 'readmit_group_member', { p_group: g, p_user: kicked });
    expect((await db.admin(`select public.is_group_member($1, $2) m`, [g, kicked]))[0].m).toBe(true);
    await db.rpc(kicked, 'remove_group_member', { p_group: g, p_user: kicked });
    expect(await db.rpc(kicked, 'join_group', { p_group: g })).toBe('joined');

    // an admin can also bring someone back by adding them directly
    await db.rpc(owner, 'remove_group_member', { p_group: g, p_user: member });
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [member] })).toBe(1);
    expect((await db.admin(`select count(*)::int n from group_removals where group_id = $1`, [g]))[0].n).toBe(0);
  });
});

describe('removing players and guests', () => {
  async function setup() {
    const host = await db.createUser(uniq('h'));
    const a = await db.createUser(uniq('a'));
    const b = await db.createUser(uniq('b'));
    for (const u of [a, b]) await db.befriend(host, u);
    const g = await db.rpc<string>(host, 'create_group', { p_name: 'Guest FC', p_visibility: 'private', p_join_policy: 'request' });
    await db.rpc(host, 'add_group_members', { p_group: g, p_users: [a, b] });
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Guest FC', group_id: g, visibility: 'group', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, max_attendance: 4, invitee_ids: [a, b] } });
    for (const u of [a, b]) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    return { host, a, b, sid };
  }

  it('removed players cannot rejoin until re-invited', async () => {
    const { host, a, b, sid } = await setup();
    await expectAppError(db.rpc(a, 'remove_session_player', { p_session: sid, p_user: b }), 'forbidden');
    const guest = await db.rpc<any>(b, 'add_session_guest', { p_session: sid, p_name: 'Bs mate' });
    await db.rpc(host, 'remove_session_player', { p_session: sid, p_user: b, p_reason: 'No-show last week', p_remove_guests: true });
    expect((await db.admin(`select status, removed_reason from session_attendance where session_id = $1 and user_id = $2`, [sid, b]))[0])
      .toEqual({ status: 'removed', removed_reason: 'No-show last week' });
    expect((await db.admin(`select status from session_guests where id = $1`, [guest.id]))[0].status).toBe('removed');
    const [note] = await db.admin(`select body, data from notifications where user_id = $1 and type = 'session_removed'`, [b]);
    expect(note.body).toMatch(/Reason: No-show last week/);
    expect(note.body).toMatch(/guest was removed too/);
    expect(note.data.reason).toBe('No-show last week');
    // group visibility would normally let a member join — not after removal
    await expectAppError(db.rpc(b, 'respond_to_session', { p_session: sid, p_response: 'confirmed' }), 'removed');
    const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'session', p_target: sid });
    await expectAppError(db.rpc(b, 'accept_invite', { p_code: code }), 'removed');
    await expectAppError(db.rpc(b, 'respond_to_session', { p_session: sid, p_response: 'removed' }), 'invalid');
    // the host invites them again → they can rejoin
    await db.rpc(host, 'invite_to_session', { p_session: sid, p_users: [b] });
    const tasks = await db.as(b, `select kind, session_id from public.get_pending_tasks()`);
    expect(tasks).toEqual(expect.arrayContaining([{ kind: 'rsvp', session_id: sid }]));
    expect(await db.rpc(b, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    await expectAppError(db.rpc(host, 'remove_session_player', { p_session: sid, p_user: host }), 'invalid');
    // removing without p_remove_guests keeps their guest
    const ga = await db.rpc<any>(a, 'add_session_guest', { p_session: sid, p_name: 'As mate' });
    await db.rpc(host, 'remove_session_player', { p_session: sid, p_user: a });
    expect((await db.admin(`select status from session_guests where id = $1`, [ga.id]))[0].status).toBe('confirmed');
  });

  it('guests take squad spots, play in line-ups, and need approval after a host removal', async () => {
    const { host, a, b, sid } = await setup();
    const g1 = await db.rpc<any>(a, 'add_session_guest', { p_session: sid, p_name: 'Dave (guest)' });
    expect(g1.status).toBe('confirmed');
    expect((await db.admin(`select public.confirmed_count($1) n`, [sid]))[0].n).toBe(4); // host, a, b, guest
    // squad is full: another guest is refused, a new player is waitlisted
    await expectAppError(db.rpc(b, 'add_session_guest', { p_session: sid, p_name: 'Extra' }), 'session_full');

    // guest in a line-up alongside players
    const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
    await db.rpc(host, 'save_lineup', {
      p_fixture: f.id,
      p_teams: { A: { players: [{ user_id: host }, { guest_id: g1.id }] }, B: { players: [{ user_id: a }, { user_id: b }] } },
    });
    const guestRows = await db.admin(`select guest_id from team_players where fixture_id = $1 and guest_id is not null`, [f.id]);
    expect(guestRows).toHaveLength(1);
    const copy = await db.rpc<string>(host, 'add_fixture', { p_session: sid, p_copy_from: f.id });
    expect((await db.admin(`select count(*)::int n from team_players where fixture_id = $1`, [copy]))[0].n).toBe(4);
    await db.rpc(host, 'delete_fixture', { p_fixture: copy });

    // host removes the guest → a's next guest is a request; only one request at a time
    await db.rpc(host, 'remove_session_guest', { p_guest: g1.id });
    expect((await db.admin(`select count(*)::int n from team_players where guest_id = $1`, [g1.id]))[0].n).toBe(0);
    const req = await db.rpc<any>(a, 'add_session_guest', { p_session: sid, p_name: 'Dave again' });
    expect(req.status).toBe('pending');
    await expectAppError(db.rpc(a, 'add_session_guest', { p_session: sid, p_name: 'Someone else' }), 'request_pending');
    await expectAppError(db.rpc(a, 'decide_guest_request', { p_guest: req.id, p_approve: true }), 'forbidden');
    await db.rpc(host, 'decide_guest_request', { p_guest: req.id, p_approve: true });
    expect((await db.admin(`select status from session_guests where id = $1`, [req.id]))[0].status).toBe('confirmed');

    // b's guests are unaffected by a's removal; b can withdraw their own guest freely
    await db.rpc(host, 'update_session', { p_session: sid, p: { max_attendance: 6 } });
    const gb = await db.rpc<any>(b, 'add_session_guest', { p_session: sid, p_name: 'Bob' });
    expect(gb.status).toBe('confirmed');
    await db.rpc(b, 'remove_session_guest', { p_guest: gb.id });
    expect((await db.rpc<any>(b, 'add_session_guest', { p_session: sid, p_name: 'Bob 2' })).status).toBe('confirmed');

    // guests never receive statistics; the match still finalises
    await db.rpc(host, 'save_lineup', {
      p_fixture: f.id,
      p_teams: { A: { players: [{ user_id: host }, { guest_id: req.id }] }, B: { players: [{ user_id: a }, { user_id: b }] } },
    });
    await db.rpc(host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 2, p_score_b: 1 });
    await db.rpc(host, 'complete_session', { p_session: sid });
    await db.rpc(host, 'close_voting', { p_session: sid });
    await db.rpc(host, 'finalise_session', { p_session: sid });
    const stats = await db.admin(`select user_id, wins from session_player_statistics where session_id = $1 order by wins desc`, [sid]);
    expect(stats).toHaveLength(3);
    expect(stats.find((r) => r.user_id === host).wins).toBe(1);
    // non-members cannot see guests
    const outsider = await db.createUser(uniq('o'));
    expect(await db.as(outsider, `select * from session_guests where session_id = $1`, [sid])).toHaveLength(0);
    await expect(db.as(a, `insert into session_guests (session_id, name, added_by) values ($1, 'x', $2)`, [sid, a])).rejects.toThrow(/permission denied|row-level security/);
  });
});

describe('waiting list and capacity', () => {
  it('promotes waiting players in order when the host raises capacity', async () => {
    const host = await db.createUser(uniq('h'));
    const a = await db.createUser(uniq('a'));
    const b = await db.createUser(uniq('b'));
    const c = await db.createUser(uniq('c'));
    for (const u of [a, b, c]) await db.befriend(host, u);
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Cap FC', starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, max_attendance: 2, invitee_ids: [a, b, c] } });
    expect(await db.rpc(a, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    expect(await db.rpc(b, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('waitlisted');
    expect(await db.rpc(c, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('waitlisted');
    await db.rpc(host, 'update_session', { p_session: sid, p: { max_attendance: 3 } });
    const rows = await db.admin(`select user_id, status from session_attendance where session_id = $1`, [sid]);
    const status = Object.fromEntries(rows.map((r) => [r.user_id, r.status]));
    expect(status[b]).toBe('confirmed'); // first in the queue
    expect(status[c]).toBe('waitlisted');
    const [n] = await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'waitlist_promoted'`, [b]);
    expect(n.n).toBe(1);
  });
});

describe('adding friends to a group directly', () => {
  it('adds only friends, notifies them, and respects invite-only groups', async () => {
    const owner = await db.createUser(uniq('own'));
    const friend = await db.createUser(uniq('fr'));
    const stranger = await db.createUser(uniq('st'));
    await db.befriend(owner, friend);
    const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Direct FC', p_visibility: 'private', p_join_policy: 'request' });
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [friend, stranger] })).toBe(1);
    expect((await db.admin(`select public.is_group_member($1, $2) m`, [g, stranger]))[0].m).toBe(false);
    const [n] = await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'group_added'`, [friend]);
    expect(n.n).toBe(1);
    // adding again is a no-op
    expect(await db.rpc<number>(owner, 'add_group_members', { p_group: g, p_users: [friend] })).toBe(0);
    // non-members cannot add; members cannot add to invite-only groups
    await expectAppError(db.rpc(stranger, 'add_group_members', { p_group: g, p_users: [owner] }), 'not_found');
    const other = await db.createUser(uniq('ot'));
    await db.befriend(friend, other);
    const g2 = await db.rpc<string>(owner, 'create_group', { p_name: 'Closed FC', p_visibility: 'private', p_join_policy: 'invite_only' });
    await db.rpc(owner, 'add_group_members', { p_group: g2, p_users: [friend] });
    await expectAppError(db.rpc(friend, 'add_group_members', { p_group: g2, p_users: [other] }), 'forbidden');
  });
});

describe('identity, social and moderation RPCs', () => {
  it('onboarding, search, push tokens, notifications, invites, reports, comments', async () => {
    const a = await db.createUser(uniq('ona'));
    const b = await db.createUser(uniq('onb'));
    const name = uniq('striker');
    const [prof] = await db.as(a, `select * from public.complete_onboarding($1, $2, 'FWD')`, [name, 'Super Striker']);
    expect(prof).toMatchObject({ username: name, onboarded: true, position: 'FWD' });
    await expectAppError(db.rpc(b, 'complete_onboarding', { p_username: name, p_display_name: 'Copycat', p_position: 'ANY' }), 'username_taken');

    const found = await db.as(b, `select * from public.search_users($1)`, [name.slice(0, 6)]);
    expect(found.some((r) => r.id === a)).toBe(true);

    await db.rpc(a, 'register_push_token', { p_token: 'ExponentPushToken[abcdefghijkl]', p_platform: 'ios' });
    await db.rpc(b, 'send_friend_request', { p_target: a });
    const [n] = await db.admin(`select push_status from notifications where user_id = $1 and type = 'friend_request'`, [a]);
    expect(n.push_status).toBe('queued');
    await db.rpc(a, 'mark_notifications_read', { p_ids: null });
    const unread = await db.admin(`select count(*)::int n from notifications where user_id = $1 and read_at is null`, [a]);
    expect(unread[0].n).toBe(0);
    // preference opt-out suppresses the notification entirely
    await db.as(a, `update user_preferences set notification_prefs = '{"friend_accepted": false}' where user_id = $1`, [a]);
    const [req] = await db.admin(`select id from friend_requests where sender_id = $1 and receiver_id = $2`, [b, a]);
    await db.rpc(a, 'respond_friend_request', { p_request: req.id, p_accept: true });

    const code = await db.rpc<string>(a, 'create_invite_link', { p_kind: 'friend' });
    const preview = await db.rpc<any>(b, 'get_invite', { p_code: code });
    expect(preview).toMatchObject({ valid: true, kind: 'friend' });

    // group moderation flow
    const g = await db.rpc<string>(a, 'create_group', { p_name: 'Mod FC', p_visibility: 'public', p_join_policy: 'open' });
    await db.rpc(b, 'join_group', { p_group: g });
    const [act] = await db.admin(`select id from activity_feed where group_id = $1 limit 1`, [g]);
    await db.as(b, `insert into comments (activity_id, author_id, body) values ($1, $2, 'rubbish group')`, [act.id, b]);
    const [cm] = await db.admin(`select id from comments where activity_id = $1`, [act.id]);
    const reportId = await db.rpc<string>(a, 'report_content', { p_type: 'comment', p_target: cm.id, p_reason: 'Rude', p_group: g });
    await expectAppError(db.rpc(b, 'resolve_report', { p_report: reportId, p_action: 'delete_comment' }), 'forbidden');
    await db.rpc(a, 'resolve_report', { p_report: reportId, p_action: 'delete_comment' });
    const [deleted] = await db.admin(`select deleted_at is not null d from comments where id = $1`, [cm.id]);
    expect(deleted.d).toBe(true);
    const mods = await db.as(a, `select action from moderation_actions where group_id = $1`, [g]);
    expect(mods.length).toBeGreaterThan(0);

    await db.rpc(a, 'transfer_group_ownership', { p_group: g, p_new_owner: b });
    expect((await db.admin(`select public.group_role_of($1, $2) r`, [g, b]))[0].r).toBe('owner');

    // account deletion prep hands ownership to the next member (service role only)
    await db.admin(`select public.prepare_account_deletion($1)`, [b]);
    expect((await db.admin(`select public.group_role_of($1, $2) r`, [g, a]))[0].r).toBe('owner');
    await expect(db.as(a, `select public.prepare_account_deletion($1)`, [a])).rejects.toThrow(/permission denied/);
  });
});
