/**
 * Row Level Security and authorisation tests. Every query here runs as the
 * `authenticated` (or `anon`) role with a JWT subject, exactly like PostgREST.
 */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function playedSession() {
  const host = await db.createUser(uniq('h'));
  const p1 = await db.createUser(uniq('a'));
  const p2 = await db.createUser(uniq('b'));
  const p3 = await db.createUser(uniq('c'));
  const absent = await db.createUser(uniq('x'));
  for (const u of [p1, p2, p3, absent]) await db.befriend(host, u);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Security FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, invitee_ids: [p1, p2, p3, absent] },
  });
  for (const u of [p1, p2, p3, absent]) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
  await db.rpc(host, 'save_lineup', {
    p_fixture: f.id,
    p_teams: { A: { players: [{ user_id: host }, { user_id: p1 }] }, B: { players: [{ user_id: p2 }, { user_id: p3 }] } },
  });
  await db.rpc(host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 2, p_score_b: 1 });
  await db.rpc(host, 'complete_session', { p_session: sid });
  return { host, p1, p2, p3, absent, sid, fixture: f.id };
}

describe('profiles & identity', () => {
  it('users can edit only their own profile and only safe columns', async () => {
    const a = await db.createUser(uniq('own'));
    const b = await db.createUser(uniq('oth'));
    await db.as(a, `update profiles set bio = 'Box-to-box' where id = $1`, [a]);
    const updated = await db.as(a, `update profiles set bio = 'hacked' where id = $1 returning id`, [b]);
    expect(updated).toHaveLength(0);
    await expect(db.as(a, `update profiles set username = 'admin' where id = $1`, [a])).rejects.toThrow(/permission denied/);
    const [row] = await db.admin(`select bio from profiles where id = $1`, [b]);
    expect(row.bio).toBeNull();
  });

  it('checks username availability (also for anonymous sign-up)', async () => {
    const a = await db.createUser('takenname');
    expect(a).toBeTruthy();
    expect(await db.rpc(null, 'is_username_available', { p_username: 'takenname' })).toBe(false);
    expect(await db.rpc(null, 'is_username_available', { p_username: 'free_name_1' })).toBe(true);
    expect(await db.rpc(null, 'is_username_available', { p_username: 'no spaces!' })).toBe(false);
  });

  it('anonymous users cannot read data', async () => {
    await expect(db.as(null, `select * from profiles limit 1`)).resolves.toHaveLength(0);
    await expectAppError(db.rpc(null, 'create_group', { p_name: 'Nope' }), 'not_authenticated');
  });

  it('blocking hides users from each other and prevents requests', async () => {
    const a = await db.createUser(uniq('blk'));
    const b = await db.createUser(uniq('blkd'));
    await db.befriend(a, b);
    await db.rpc(a, 'block_user', { p_user: b });
    expect(await db.rpc(a, 'get_player_profile', { p_user: a })).toBeTruthy();
    expect(await db.as(b, `select id from profiles where id = $1`, [a])).toHaveLength(0);
    await expectAppError(db.rpc(b, 'send_friend_request', { p_target: a }), 'blocked');
    expect((await db.admin(`select public.are_friends($1,$2) f`, [a, b]))[0].f).toBe(false);
  });

  it('private profiles hide statistics from non-friends', async () => {
    const a = await db.createUser(uniq('priv'));
    const friend = await db.createUser(uniq('fr'));
    const stranger = await db.createUser(uniq('st'));
    await db.befriend(a, friend);
    await db.as(a, `update user_preferences set profile_visibility = 'friends' where user_id = $1`, [a]);
    const asStranger = await db.rpc<any>(stranger, 'get_player_profile', { p_user: a });
    expect(asStranger.can_view_stats).toBe(false);
    expect(asStranger.stats).toBeNull();
    const asFriend = await db.rpc<any>(friend, 'get_player_profile', { p_user: a });
    expect(asFriend.can_view_stats).toBe(true);
    // nobody can read someone else's preferences
    expect(await db.as(stranger, `select * from user_preferences where user_id = $1`, [a])).toHaveLength(0);
  });

  it('friend requests are not duplicated and reverse requests auto-accept', async () => {
    const a = await db.createUser(uniq('fa'));
    const b = await db.createUser(uniq('fb'));
    expect(await db.rpc(a, 'send_friend_request', { p_target: b })).toBe('sent');
    expect(await db.rpc(a, 'send_friend_request', { p_target: b })).toBe('already_pending');
    expect(await db.rpc(b, 'send_friend_request', { p_target: a })).toBe('accepted');
    const [n] = await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'friend_accepted'`, [a]);
    expect(n.n).toBe(1);
    // the request receiver only can respond
    const c = await db.createUser(uniq('fc'));
    await db.rpc(a, 'send_friend_request', { p_target: c });
    const [req] = await db.admin(`select id from friend_requests where sender_id = $1 and receiver_id = $2`, [a, c]);
    await expectAppError(db.rpc(b, 'respond_friend_request', { p_request: req.id, p_accept: true }), 'not_found');
  });
});

describe('voting integrity', () => {
  it('prevents self-voting, duplicate votes, absent voters and votes after the deadline', async () => {
    const { host, p1, p2, p3, absent, sid } = await playedSession();
    await expectAppError(db.rpc(p1, 'cast_motm_vote', { p_session: sid, p_nominee: p1 }), 'self_vote');
    await expectAppError(db.rpc(absent, 'cast_motm_vote', { p_session: sid, p_nominee: p1 }), 'not_participant');
    await expectAppError(db.rpc(p1, 'cast_motm_vote', { p_session: sid, p_nominee: absent }), 'invalid_nominee');
    await db.rpc(p1, 'cast_motm_vote', { p_session: sid, p_nominee: p2 });
    await expectAppError(db.rpc(p1, 'cast_motm_vote', { p_session: sid, p_nominee: p3 }), 'already_voted');
    await expectAppError(db.rpc(p1, 'submit_ratings', { p_session: sid, p_ratings: [{ user_id: p1, score: 10 }] }), 'self_vote');
    await expectAppError(db.rpc(p1, 'submit_ratings', { p_session: sid, p_ratings: [{ user_id: p2, score: 11 }] }), 'invalid');
    await db.rpc(p1, 'submit_ratings', { p_session: sid, p_ratings: [{ user_id: p2, score: 8 }] });

    // ballots cannot be inserted, edited or deleted directly
    await expect(db.as(p2, `insert into motm_votes (session_id, voter_id, nominee_id) values ($1, $2, $3)`, [sid, p2, p3])).rejects.toThrow(/row-level security/);
    const upd = await db.as(p1, `update player_ratings set score = 10 where rater_id = $1 returning id`, [p1]);
    expect(upd).toHaveLength(0);
    const del = await db.as(p1, `delete from motm_votes where voter_id = $1 returning id`, [p1]);
    expect(del).toHaveLength(0);
    // nobody (not even the host) can read other people's ballots
    expect(await db.as(host, `select * from player_ratings where session_id = $1`, [sid])).toHaveLength(0);

    await db.admin(`update sessions set voting_closes_at = now() - interval '1 second' where id = $1`, [sid]);
    await expectAppError(db.rpc(p3, 'cast_motm_vote', { p_session: sid, p_nominee: p2 }), 'voting_closed');
  });

  it('only counts ratings for eligible sessions above the threshold', async () => {
    const { host, p1, p2, p3, sid } = await playedSession();
    // 4 verified players → threshold 2 valid ratings
    expect((await db.admin(`select public.min_ratings_required(4) n`))[0].n).toBe(2);
    await db.rpc(p1, 'submit_ratings', { p_session: sid, p_ratings: [{ user_id: p2, score: 8 }, { user_id: p3, score: 4 }] });
    await db.rpc(host, 'submit_ratings', { p_session: sid, p_ratings: [{ user_id: p2, score: 6 }] });
    await db.rpc(host, 'finalise_session', { p_session: sid });
    const rows = await db.admin(`select user_id, rating_avg, rating_count, rating_eligible from session_player_statistics where session_id = $1`, [sid]);
    const p2row = rows.find((r) => r.user_id === p2);
    const p3row = rows.find((r) => r.user_id === p3);
    expect(Number(p2row.rating_avg)).toBe(7);
    expect(p2row.rating_eligible).toBe(true);
    expect(p3row.rating_eligible).toBe(false);
  });
});

describe('results, goals and statistics permissions', () => {
  it('players cannot modify official results or statistics', async () => {
    const { host, p1, sid, fixture } = await playedSession();
    expect(await db.as(p1, `update fixture_teams set score = 10 where fixture_id = $1 returning id`, [fixture])).toHaveLength(0);
    await expect(db.as(p1, `insert into player_goals (session_id, user_id, goals) values ($1, $2, 5)`, [sid, p1])).rejects.toThrow(/row-level security/);
    await expect(
      db.as(p1, `insert into session_player_statistics (session_id, user_id, played_at, goals) values ($1, $2, now(), 99)`, [sid, p1]),
    ).rejects.toThrow(/row-level security/);
    expect(await db.as(p1, `update sessions set status = 'finalised' where id = $1 returning id`, [sid])).toHaveLength(0);
    await expectAppError(db.rpc(p1, 'finalise_session', { p_session: sid }), 'forbidden');
    await expectAppError(db.rpc(p1, 'set_attendance_verification', { p_session: sid, p_user: p1, p_verification: 'verified' }), 'forbidden');
    await expectAppError(db.rpc(p1, 'correct_session', { p_session: sid, p_kind: 'score', p_data: {}, p_reason: 'x' }), 'forbidden');
    expect(host).toBeTruthy();
  });

  it('absent players cannot submit goals or receive statistics', async () => {
    const { host, absent, sid } = await playedSession();
    const [a] = await db.admin(`select verification from session_attendance where session_id = $1 and user_id = $2`, [sid, absent]);
    expect(a.verification).toBe('absent');
    await expectAppError(db.rpc(absent, 'submit_goals', { p_session: sid, p_goals: 1 }), 'not_participant');
    await db.rpc(host, 'finalise_session', { p_session: sid });
    expect(await db.admin(`select * from session_player_statistics where session_id = $1 and user_id = $2`, [sid, absent])).toHaveLength(0);
  });

  it('host goals are auto-approved but capped; correction requires a reason; trail is append-only', async () => {
    const { host, p1, p2, sid } = await playedSession();
    // host's team (A) scored 2
    await expectAppError(db.rpc(host, 'submit_goals', { p_session: sid, p_goals: 3 }), 'impossible_goals');
    const sub = await db.rpc<string>(host, 'submit_goals', { p_session: sid, p_goals: 1 });
    const [row] = await db.admin(`select status, approved_goals from goal_submissions where id = $1`, [sub]);
    expect(row).toEqual({ status: 'approved', approved_goals: 1 });
    const reviews = await db.admin(`select action, reason from goal_reviews where submission_id = $1`, [sub]);
    expect(reviews).toEqual([{ action: 'approved', reason: 'Auto-approved: submitted by the host' }]);
    const audit = await db.admin(`select 1 from audit_logs where action = 'goals.host_self_approved' and entity_id = $1`, [sub]);
    expect(audit).toHaveLength(1);
    // a regular player still needs approval, and a correction needs a reason
    const p2sub = await db.rpc<string>(p2, 'submit_goals', { p_session: sid, p_goals: 1 });
    expect((await db.admin(`select status from goal_submissions where id = $1`, [p2sub]))[0].status).toBe('pending');
    await expectAppError(db.rpc(host, 'review_goal_submission', { p_submission: p2sub, p_action: 'corrected', p_goals: 0 }), 'reason_required');
    expect(p1).toBeTruthy();
    await expect(db.admin(`update goal_reviews set action = 'rejected' where submission_id = $1`, [sub])).rejects.toThrow(/append-only/);
  });

  it('goals plus assists cannot exceed team goals, per game and in total', async () => {
    const { host, p1, p2, p3, sid } = await playedSession(); // A (host, p1) 2 – 1 B (p2, p3)
    await expectAppError(db.rpc(p1, 'submit_goals', { p_session: sid, p_goals: 2, p_assists: 1 }), 'impossible_assists');
    await expectAppError(db.rpc(p1, 'submit_goals', { p_session: sid, p_goals: 0, p_assists: 3 }), 'impossible_assists');
    const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
    await expectAppError(db.rpc(p2, 'submit_goals', { p_session: sid, p_goals: 1, p_assists: 1, p_breakdown: [{ fixture_id: f.id, goals: 1, assists: 1 }] }), 'impossible_assists');
    const ok = await db.rpc<string>(p1, 'submit_goals', { p_session: sid, p_goals: 1, p_assists: 1, p_breakdown: [{ fixture_id: f.id, goals: 1, assists: 1 }] });
    await db.rpc(host, 'review_goal_submission', { p_submission: ok, p_action: 'approved' });
    const pg = await db.admin(`select goals, assists from player_goals where submission_id = $1`, [ok]);
    expect(pg).toEqual([{ goals: 1, assists: 1 }]);
    // B scored 1: p3's assist + p2's goal is fine
    const a = await db.rpc<string>(p3, 'submit_goals', { p_session: sid, p_goals: 0, p_assists: 1 });
    await db.rpc(host, 'review_goal_submission', { p_submission: a, p_action: 'approved' });
  });

  it('audit log is append-only and hidden from clients', async () => {
    const { host, sid } = await playedSession();
    expect(await db.as(host, `select * from audit_logs where entity_id = $1`, [sid])).toHaveLength(0);
    const logs = await db.admin(`select action from audit_logs where entity_id = $1 order by id`, [sid]);
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['session.created', 'session.completed']));
    await expect(db.admin(`delete from audit_logs where entity_id = $1`, [sid])).rejects.toThrow(/append-only/);
  });

  it('internal functions cannot be called by clients', async () => {
    const { p1, sid } = await playedSession();
    await expect(db.as(p1, `select public.compute_session_statistics($1)`, [sid])).rejects.toThrow(/permission denied/);
    await expect(db.as(p1, `select public.notify($1, 'x', 'spam')`, [p1])).rejects.toThrow(/permission denied/);
    await expect(db.as(p1, `select public.process_session_deadlines()`)).rejects.toThrow(/permission denied/);
  });
});

describe('payments', () => {
  it('clients can never mark themselves as paid', async () => {
    const { host, p1, sid } = await playedSession();
    await db.admin(`insert into payments (session_id, payer_id, payee_id, amount_pence, mode, status) values ($1, $2, $3, 600, 'after', 'unpaid')`, [sid, p1, host]);
    expect(await db.as(p1, `update payments set status = 'paid' where payer_id = $1 returning id`, [p1])).toHaveLength(0);
    await expect(
      db.as(p1, `insert into payments (session_id, payer_id, amount_pence, mode, status) values ($1, $2, 600, 'after', 'paid')`, [sid, p1]),
    ).rejects.toThrow(/row-level security/);
    const statuses = await db.as(p1, `select * from public.get_session_payment_statuses($1)`, [sid]);
    expect(statuses[0].status).toBe('unpaid');
    // service-side status change notifies the payer
    await db.admin(`update payments set status = 'paid', paid_at = now() where payer_id = $1 and session_id = $2`, [p1, sid]);
    const n = await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'payment_confirmed'`, [p1]);
    expect(n[0].n).toBe(1);
    // only managers see the host dashboard
    await expectAppError(db.rpc(p1, 'get_payment_summary', { p_session: sid }), 'forbidden');
  });
});

describe('groups', () => {
  it('enforces role-based permissions', async () => {
    const owner = await db.createUser(uniq('own'));
    const admin = await db.createUser(uniq('adm'));
    const member = await db.createUser(uniq('mem'));
    const outsider = await db.createUser(uniq('out'));
    const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Role FC', p_visibility: 'public', p_join_policy: 'open' });
    expect(await db.rpc(admin, 'join_group', { p_group: g })).toBe('joined');
    expect(await db.rpc(member, 'join_group', { p_group: g })).toBe('joined');
    await db.rpc(owner, 'set_member_role', { p_group: g, p_user: admin, p_role: 'admin' });
    await expectAppError(db.rpc(member, 'set_member_role', { p_group: g, p_user: admin, p_role: 'member' }), 'forbidden');
    await expectAppError(db.rpc(admin, 'set_member_role', { p_group: g, p_user: owner, p_role: 'member' }), 'forbidden');
    await expectAppError(db.rpc(owner, 'remove_group_member', { p_group: g, p_user: owner }), 'owner_cannot_leave');
    expect(await db.as(member, `update groups set name = 'Hacked' where id = $1 returning id`, [g])).toHaveLength(0);
    expect(await db.as(admin, `update groups set description = 'Wednesdays 7pm' where id = $1 returning id`, [g])).toHaveLength(1);
    // public group visible to outsiders; private group is not
    expect(await db.as(outsider, `select id from groups where id = $1`, [g])).toHaveLength(1);
    const priv = await db.rpc<string>(owner, 'create_group', { p_name: 'Secret FC', p_visibility: 'private', p_join_policy: 'invite_only' });
    expect(await db.as(outsider, `select id from groups where id = $1`, [priv])).toHaveLength(0);
    expect(await db.as(outsider, `select * from group_members where group_id = $1`, [priv])).toHaveLength(0);
    await expectAppError(db.rpc(outsider, 'join_group', { p_group: priv }), 'not_found');
    await expectAppError(db.rpc(admin, 'create_invite_link', { p_kind: 'group', p_target: priv }), 'forbidden');
  });

  it('join requests require admin approval', async () => {
    const owner = await db.createUser(uniq('own'));
    const joiner = await db.createUser(uniq('j'));
    const g = await db.rpc<string>(owner, 'create_group', { p_name: 'Request FC', p_visibility: 'public', p_join_policy: 'request' });
    expect(await db.rpc(joiner, 'join_group', { p_group: g, p_message: 'Can I play?' })).toBe('requested');
    const [req] = await db.as(owner, `select id from group_join_requests where group_id = $1`, [g]);
    await expectAppError(db.rpc(joiner, 'decide_join_request', { p_request: req.id, p_approve: true }), 'forbidden');
    await db.rpc(owner, 'decide_join_request', { p_request: req.id, p_approve: true });
    expect((await db.admin(`select public.is_group_member($1, $2) m`, [g, joiner]))[0].m).toBe(true);
  });

  it('expired invites are rejected', async () => {
    const a = await db.createUser(uniq('inv'));
    const b = await db.createUser(uniq('inb'));
    const code = await db.rpc<string>(a, 'create_invite_link', { p_kind: 'friend' });
    await db.admin(`update invite_links set expires_at = now() - interval '1 minute' where code = $1`, [code]);
    await expectAppError(db.rpc(b, 'accept_invite', { p_code: code }), 'invite_expired');
  });
});

describe('sessions', () => {
  it('private sessions require an invitation; withdrawal deadline is enforced', async () => {
    const host = await db.createUser(uniq('h'));
    const friend = await db.createUser(uniq('f'));
    const stranger = await db.createUser(uniq('s'));
    await db.befriend(host, friend);
    const sid = await db.rpc<string>(host, 'create_session', {
      p: {
        name: 'Private Kickabout', starts_at: new Date(Date.now() + 12 * 3600_000).toISOString(), format_size: 6,
        invitee_ids: [friend, stranger],
      },
    });
    // strangers are silently not invited (you may only invite friends / group members)
    expect(await db.admin(`select * from session_invitations where session_id = $1 and user_id = $2`, [sid, stranger])).toHaveLength(0);
    await expectAppError(db.rpc(stranger, 'respond_to_session', { p_session: sid, p_response: 'confirmed' }), 'forbidden');
    expect(await db.as(stranger, `select id from sessions where id = $1`, [sid])).toHaveLength(0);
    expect(await db.rpc(friend, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    await expectAppError(db.rpc(friend, 'respond_to_session', { p_session: sid, p_response: 'withdrawn' }), 'deadline_passed');
  });

  it('drop-outs close 24 hours before kick-off and MOTM is per session', async () => {
    const host = await db.createUser(uniq('h'));
    const kickoff = new Date(Date.now() + 3 * 86400_000);
    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Simple FC', starts_at: kickoff.toISOString(), format_size: 5, motm_mode: 'fixture', rsvp_deadline: '' },
    });
    const row = async () => (await db.admin(`select motm_mode, rsvp_deadline, starts_at from sessions where id = $1`, [sid]))[0];
    let s = await row();
    expect(s.motm_mode).toBe('session');
    expect(new Date(s.starts_at).getTime() - new Date(s.rsvp_deadline).getTime()).toBe(86400_000);
    // moving kick-off moves the deadline with it
    await db.rpc(host, 'update_session', { p_session: sid, p: { starts_at: new Date(kickoff.getTime() + 3600_000).toISOString(), rsvp_deadline: '', motm_mode: 'fixture' } });
    s = await row();
    expect(s.motm_mode).toBe('session');
    expect(new Date(s.starts_at).getTime() - new Date(s.rsvp_deadline).getTime()).toBe(86400_000);
  });

  it('rate limits abusive request patterns', async () => {
    const a = await db.createUser(uniq('spam'));
    const targets: string[] = [];
    for (let i = 0; i < 31; i++) targets.push(await db.createUser(uniq('t')));
    for (let i = 0; i < 30; i++) await db.rpc(a, 'send_friend_request', { p_target: targets[i] });
    await expectAppError(db.rpc(a, 'send_friend_request', { p_target: targets[30] }), 'rate_limited');
  });
});

describe('line-up visibility', () => {
  it('players only see line-ups once the host confirms them', async () => {
    const host = await db.createUser(uniq('lh'));
    const p1 = await db.createUser(uniq('la'));
    const p2 = await db.createUser(uniq('lb'));
    for (const u of [p1, p2]) await db.befriend(host, u);
    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Draft FC', starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, invitee_ids: [p1, p2] },
    });
    for (const u of [p1, p2]) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
    const teams = { A: { players: [{ user_id: host }, { user_id: p1 }] }, B: { players: [{ user_id: p2 }] } };
    const visible = (u: string) => db.as(u, `select user_id from team_players where fixture_id = $1`, [f.id]);

    await db.rpc(host, 'save_lineup', { p_fixture: f.id, p_teams: teams, p_confirm: false });
    expect(await visible(host)).toHaveLength(3);
    expect(await visible(p1)).toHaveLength(0);
    expect((await db.admin(`select count(*)::int n from notifications where type = 'lineup_announced' and data->>'fixture_id' = $1`, [f.id]))[0].n).toBe(0);

    await db.rpc(host, 'save_lineup', { p_fixture: f.id, p_teams: teams, p_confirm: true });
    expect(await visible(p1)).toHaveLength(3);
    expect(await visible(p2)).toHaveLength(3);
    const notes = await db.admin(`select user_id, title from notifications where type = 'lineup_announced' and data->>'fixture_id' = $1`, [f.id]);
    expect(notes.map((n) => n.user_id).sort()).toEqual([p1, p2].sort());

    // changing confirmed teams tells the squad
    await db.rpc(host, 'save_lineup', { p_fixture: f.id, p_teams: { A: { players: [{ user_id: host }, { user_id: p2 }] }, B: { players: [{ user_id: p1 }] } }, p_confirm: true });
    const updated = await db.admin(`select count(*)::int n from notifications where title = 'Line-ups updated' and data->>'fixture_id' = $1`, [f.id]);
    expect(updated[0].n).toBe(2);
  });
});
