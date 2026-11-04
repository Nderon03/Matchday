/**
 * End-to-end backend journeys, executed against the real migrations with RLS enforced.
 * Mirrors the product's core loop: create → invite → attend → teams → play → results →
 * goals → vote → finalise → stats → leaderboards → achievements → feed.
 */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function setupGroup(n: number) {
  const users: string[] = [];
  for (let i = 0; i < n; i++) users.push(await db.createUser(uniq('p')));
  const [host, ...rest] = users;
  const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Wednesday Football', p_join_policy: 'open', p_visibility: 'private' });
  // private + open is joinable only via invite link
  const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'group', p_target: groupId });
  for (const u of rest) await db.rpc(u, 'accept_invite', { p_code: code });
  return { users, host, rest, groupId };
}

async function createSession(host: string, groupId: string, invitees: string[], extra: Record<string, unknown> = {}) {
  return db.rpc<string>(host, 'create_session', {
    p: {
      name: 'Wednesday Football',
      group_id: groupId,
      starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      format_size: 5,
      max_attendance: 10,
      invitee_ids: invitees,
      ...extra,
    },
  });
}

async function lineup(host: string, fixtureId: string, a: string[], b: string[]) {
  await db.rpc(host, 'save_lineup', {
    p_fixture: fixtureId,
    p_teams: {
      A: { players: a.map((user_id, i) => ({ user_id, is_goalkeeper: i === 0 })) },
      B: { players: b.map((user_id, i) => ({ user_id, is_goalkeeper: i === 0 })) },
    },
  });
}

describe('single-match journey (5-a-side)', () => {
  it('runs the whole loop and produces verified statistics', async () => {
    // 1-5: registration (profiles auto-created), friendship, group
    const a = await db.createUser(uniq('usera'));
    const b = await db.createUser(uniq('userb'));
    const [pa] = await db.admin(`select * from profiles where id = $1`, [a]);
    expect(pa.username).toMatch(/^usera/);
    await db.befriend(a, b);
    expect((await db.admin(`select public.are_friends($1, $2) ok`, [a, b]))[0].ok).toBe(true);

    const { users, host, rest, groupId } = await setupGroup(9);
    await db.rpc(b, 'join_group', { p_group: groupId }).catch(() => undefined); // private group: not discoverable
    const all = [host, ...rest];

    // 6: host creates 5-a-side session with invites
    const sessionId = await createSession(host, groupId, rest);
    const invites = await db.admin(`select count(*)::int n from session_invitations where session_id = $1`, [sessionId]);
    expect(invites[0].n).toBe(8);
    const notif = await db.as(rest[0], `select type from notifications where data->>'session_id' = $1`, [sessionId]);
    expect(notif.map((r) => r.type)).toContain('session_invite');

    // 7: attendance
    for (const u of rest) expect(await db.rpc(u, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' })).toBe('confirmed');
    const extra = await db.createUser(uniq('late'));
    await db.befriend(host, extra);
    await db.rpc(host, 'invite_to_session', { p_session: sessionId, p_users: [extra] });
    expect(await db.rpc(extra, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' })).toBe('confirmed'); // 10th player
    const waiter = await db.createUser(uniq('wait'));
    await db.befriend(host, waiter);
    await db.rpc(host, 'invite_to_session', { p_session: sessionId, p_users: [waiter] });
    expect(await db.rpc(waiter, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' })).toBe('waitlisted');
    // a withdrawal in the last 24 hours offers the place to the next on the waiting list, who takes it
    expect(await db.rpc(extra, 'respond_to_session', { p_session: sessionId, p_response: 'withdrawn' })).toBe('withdrawn');
    const [w] = await db.admin(`select status, offer_expires_at from session_attendance where session_id = $1 and user_id = $2`, [sessionId, waiter]);
    expect(w.status).toBe('waitlisted');
    expect(w.offer_expires_at).not.toBeNull();
    expect((await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'waitlist_offer'`, [waiter]))[0].n).toBe(1);
    expect(await db.rpc(waiter, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' })).toBe('confirmed');
    await db.rpc(waiter, 'respond_to_session', { p_session: sessionId, p_response: 'withdrawn' });
    await db.rpc(extra, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' });

    // 8-9: line-ups
    const players = [...all.slice(0, 9), extra];
    const [fx] = await db.admin(`select id from fixtures where session_id = $1`, [sessionId]);
    const teamA = players.slice(0, 5);
    const teamB = players.slice(5);
    await lineup(host, fx.id, teamA, teamB);
    // non-host cannot change line-ups
    await expectAppError(db.rpc(rest[0], 'save_lineup', { p_fixture: fx.id, p_teams: { A: { players: [] }, B: { players: [] } } }), 'forbidden');
    // a declined/non-confirmed player cannot be selected
    await expectAppError(lineup(host, fx.id, [...teamA.slice(0, 4), waiter], teamB), 'ineligible_player');

    // 10-11: match played, host records 8–6
    await db.rpc(host, 'record_fixture_score', { p_fixture: fx.id, p_score_a: 8, p_score_b: 6 });
    await expectAppError(db.rpc(rest[0], 'record_fixture_score', { p_fixture: fx.id, p_score_a: 9, p_score_b: 0 }), 'forbidden');
    await db.rpc(host, 'complete_session', { p_session: sessionId });
    const verified = await db.admin(`select count(*)::int n from session_attendance where session_id = $1 and verification = 'verified'`, [sessionId]);
    expect(verified[0].n).toBe(10);
    // the waiter who withdrew is not verified and cannot vote
    await expectAppError(db.rpc(waiter, 'cast_motm_vote', { p_session: sessionId, p_nominee: host }), 'not_participant');

    // 12-13: goals
    const scorer = teamA[1];
    await expectAppError(db.rpc(scorer, 'submit_goals', { p_session: sessionId, p_goals: 9 }), 'impossible_goals');
    const subId = await db.rpc<string>(scorer, 'submit_goals', { p_session: sessionId, p_goals: 3, p_assists: 1 });
    await expectAppError(db.rpc(scorer, 'review_goal_submission', { p_submission: subId, p_action: 'approved' }), 'forbidden');
    await expectAppError(db.rpc(teamB[0], 'review_goal_submission', { p_submission: subId, p_action: 'approved' }), 'forbidden');
    await db.rpc<string>(teamB[1], 'submit_goals', { p_session: sessionId, p_goals: 2 });
    const sub3 = await db.rpc<string>(teamB[2], 'submit_goals', { p_session: sessionId, p_goals: 4 });
    await db.rpc(host, 'review_goal_submission', { p_submission: sub3, p_action: 'corrected', p_goals: 3, p_reason: 'One was an own goal' });
    // the host's own claim is approved automatically (capped by the score and audited)
    const hostSub = await db.rpc<string>(host, 'submit_goals', { p_session: sessionId, p_goals: 2 });
    expect((await db.admin(`select status from goal_submissions where id = $1`, [hostSub]))[0].status).toBe('approved');
    await expectAppError(db.rpc(host, 'review_goal_submission', { p_submission: hostSub, p_action: 'approved' }), 'forbidden');
    // finalisation is blocked while claims are pending
    await expectAppError(db.rpc(host, 'finalise_session', { p_session: sessionId }), 'pending_claims');
    expect(await db.rpc<number>(host, 'bulk_approve_goals', { p_session: sessionId })).toBe(2);

    // 14-15: MOTM + ratings
    await expectAppError(db.rpc(scorer, 'cast_motm_vote', { p_session: sessionId, p_nominee: scorer }), 'self_vote');
    for (const u of players) {
      if (u !== scorer) await db.rpc(u, 'cast_motm_vote', { p_session: sessionId, p_nominee: scorer });
    }
    await db.rpc(scorer, 'cast_motm_vote', { p_session: sessionId, p_nominee: host });
    await expectAppError(db.rpc(host, 'cast_motm_vote', { p_session: sessionId, p_nominee: teamB[0] }), 'already_voted');
    for (const rater of players) {
      const ratings = players.filter((p) => p !== rater).map((p) => ({ user_id: p, score: p === scorer ? 9 : 6 }));
      await db.rpc(rater, 'submit_ratings', { p_session: sessionId, p_ratings: ratings });
    }
    await expectAppError(
      db.rpc(players[0], 'submit_ratings', { p_session: sessionId, p_ratings: [{ user_id: players[1], score: 10 }] }),
      'already_voted',
    );
    // ballots are anonymous: a player only sees their own votes
    const visible = await db.as(teamB[0], `select count(*)::int n from motm_votes where session_id = $1`, [sessionId]);
    expect(visible[0].n).toBe(1);
    // host cannot peek at the tally while voting is open
    await expectAppError(db.rpc(host, 'get_motm_tally', { p_session: sessionId }), 'voting_open');

    // 16: finalise
    await db.rpc(host, 'finalise_session', { p_session: sessionId });
    const [s] = await db.admin(`select status from sessions where id = $1`, [sessionId]);
    expect(s.status).toBe('finalised');

    // 17: career statistics
    const [stats] = await db.as(scorer, `select * from session_player_statistics where session_id = $1 and user_id = $2`, [sessionId, scorer]);
    expect(stats).toMatchObject({ goals: 3, assists: 1, wins: 1, losses: 0, fixtures_played: 1, goals_for: 8, goals_against: 6, motm: true, rating_count: 9, rating_eligible: true });
    expect(Number(stats.rating_avg)).toBe(9);
    const [corrected] = await db.admin(`select goals from session_player_statistics where session_id = $1 and user_id = $2`, [sessionId, teamB[2]]);
    expect(corrected.goals).toBe(3);
    const profile = await db.rpc<any>(rest[0], 'get_player_profile', { p_user: scorer });
    expect(profile.stats).toMatchObject({ sessions: 1, goals: 3, wins: 1, motm: 1 });
    expect(Number(profile.stats.win_pct)).toBe(100);

    // 18: group leaderboard
    const lb = await db.as(host, `select * from public.get_leaderboard('goals', 'group', $1)`, [groupId]);
    // scorer (3) and the corrected claim (3) tie: both share rank 1
    expect(lb.find((r) => r.user_id === scorer)).toMatchObject({ rank: 1 });
    expect(lb.filter((r) => r.rank === 1)).toHaveLength(2);
    expect(Number(lb[0].value)).toBe(3);
    // win% requires the minimum number of appearances — nobody qualifies after one game
    const pct = await db.as(host, `select * from public.get_leaderboard('win_pct', 'group', $1)`, [groupId]);
    expect(pct.filter((r) => r.qualified)).toHaveLength(0);
    // …but players still appear as "not qualified yet", with their progress
    expect(pct.length).toBeGreaterThan(0);
    expect(pct[0]).toMatchObject({ qualified: false, rank: null, progress: 1, needed: 5 });
    const rating1 = await db.as(host, `select * from public.get_leaderboard('rating', 'group', $1)`, [groupId]);
    expect(rating1.find((r) => r.user_id === scorer)).toMatchObject({ qualified: false, progress: 1, needed: 3 });
    expect(Number(rating1.find((r) => r.user_id === scorer).value)).toBe(9);

    // 19: achievements
    const ach = await db.admin(`select achievement_code from player_achievements where user_id = $1 order by 1`, [scorer]);
    expect(ach.map((r) => r.achievement_code)).toEqual(['apps_l1', 'assists_l1', 'goals_l1', 'haul_l1', 'haul_l2', 'motm_l1']);
    // re-running never duplicates
    await db.admin(`select public.award_achievements($1, $2)`, [scorer, sessionId]);
    expect((await db.admin(`select count(*)::int n from player_achievements where user_id = $1`, [scorer]))[0].n).toBe(6);

    // 20: activity feed shows the result to group members, not to outsiders
    const feed = await db.as(rest[3], `select type from activity_feed where session_id = $1`, [sessionId]);
    expect(feed.map((r) => r.type)).toEqual(expect.arrayContaining(['session_result', 'motm', 'hat_trick']));
    const outsider = await db.createUser(uniq('out'));
    expect(await db.as(outsider, `select * from activity_feed where session_id = $1`, [sessionId])).toHaveLength(0);
    expect(await db.as(outsider, `select * from sessions where id = $1`, [sessionId])).toHaveLength(0);
    await expectAppError(db.rpc(outsider, 'get_leaderboard', { p_category: 'goals', p_scope: 'group', p_group: groupId }), 'forbidden');
    expect(users.length).toBe(9);
  });
});

describe('multi-fixture journey with changing teams', () => {
  it('aggregates fixtures into one session appearance', async () => {
    const { host, rest, groupId } = await setupGroup(10);
    const players = [host, ...rest];
    const sessionId = await createSession(host, groupId, rest, { format_size: 5 });
    for (const u of rest) await db.rpc(u, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' });
    const [f1] = await db.admin(`select id from fixtures where session_id = $1 and number = 1`, [sessionId]);
    await lineup(host, f1.id, players.slice(0, 5), players.slice(5));
    await db.rpc(host, 'record_fixture_score', { p_fixture: f1.id, p_score_a: 3, p_score_b: 2 });

    // Game 2 keeps teams
    const f2 = await db.rpc<string>(host, 'add_fixture', { p_session: sessionId, p_copy_from: f1.id });
    const copied = await db.admin(`select count(*)::int n from team_players where fixture_id = $1`, [f2]);
    expect(copied[0].n).toBe(10);
    await db.rpc(host, 'record_fixture_score', { p_fixture: f2, p_score_a: 1, p_score_b: 4 });

    // Game 3 reshuffled: swap players[0] and players[5]
    const f3 = await db.rpc<string>(host, 'add_fixture', { p_session: sessionId });
    const a3 = [players[5], ...players.slice(1, 5)];
    const b3 = [players[0], ...players.slice(6)];
    await lineup(host, f3, a3, b3);
    await expectAppError(db.rpc(host, 'complete_session', { p_session: sessionId }), 'fixture_unplayed');
    await db.rpc(host, 'record_fixture_score', { p_fixture: f3, p_score_a: 2, p_score_b: 2 });
    await db.rpc(host, 'complete_session', { p_session: sessionId, p_voting_hours: 1 });

    const [mode] = await db.admin(`select mode from sessions where id = $1`, [sessionId]);
    expect(mode.mode).toBe('multi');

    // session-level goal entry with an optional fixture breakdown
    const sub = await db.rpc<string>(players[1], 'submit_goals', {
      p_session: sessionId,
      p_goals: 3,
      p_breakdown: [
        { fixture_id: f1.id, goals: 2 },
        { fixture_id: f3, goals: 1 },
      ],
    });
    await expectAppError(
      db.rpc(players[2], 'submit_goals', { p_session: sessionId, p_goals: 2, p_breakdown: [{ fixture_id: f2, goals: 2 }] }),
      'impossible_goals',
    );
    await db.rpc(host, 'review_goal_submission', { p_submission: sub, p_action: 'approved' });
    const pg = await db.admin(`select fixture_id, goals from player_goals where submission_id = $1 order by goals desc`, [sub]);
    expect(pg).toEqual([
      { fixture_id: f1.id, goals: 2 },
      { fixture_id: f3, goals: 1 },
    ]);

    // MOTM tie → shared award (no winner invented)
    await db.rpc(players[2], 'cast_motm_vote', { p_session: sessionId, p_nominee: players[1] });
    await db.rpc(players[3], 'cast_motm_vote', { p_session: sessionId, p_nominee: players[7] });
    await db.rpc(host, 'close_voting', { p_session: sessionId });
    await expectAppError(db.rpc(players[4], 'cast_motm_vote', { p_session: sessionId, p_nominee: players[1] }), 'voting_closed');
    await db.rpc(host, 'finalise_session', { p_session: sessionId });
    const awards = await db.admin(`select user_id, shared from motm_awards where session_id = $1 order by user_id`, [sessionId]);
    expect(awards).toHaveLength(2);
    expect(awards.every((x) => x.shared)).toBe(true);

    // players[0] moved teams in game 3: W, L, D. players[1] stayed on A: W, L, D. players[5]: L, W, D
    const [s0] = await db.admin(`select * from session_player_statistics where session_id = $1 and user_id = $2`, [sessionId, players[0]]);
    expect(s0).toMatchObject({ fixtures_played: 3, wins: 1, losses: 1, draws: 1, goals_for: 6, goals_against: 8 });
    const [s5] = await db.admin(`select * from session_player_statistics where session_id = $1 and user_id = $2`, [sessionId, players[5]]);
    expect(s5).toMatchObject({ fixtures_played: 3, wins: 1, losses: 1, draws: 1, goals_for: 8, goals_against: 6 });
    // one session appearance, three fixture appearances
    const career = await db.admin(`select sessions, fixtures from v_career_stats where user_id = $1`, [players[0]]);
    expect(career[0]).toEqual({ sessions: 1, fixtures: 3 });

    // ratings below threshold are not eligible (nobody rated)
    expect(s0.rating_eligible).toBe(false);

    // audited correction after finalisation recomputes stats
    await db.rpc(host, 'correct_session', {
      p_session: sessionId,
      p_kind: 'score',
      p_data: { fixture_id: f3, score_a: 3, score_b: 2 },
      p_reason: 'Late goal missed',
    });
    const [s0b] = await db.admin(`select wins, losses, draws from session_player_statistics where session_id = $1 and user_id = $2`, [sessionId, players[0]]);
    expect(s0b).toEqual({ wins: 1, losses: 2, draws: 0 });
    const audits = await db.admin(`select action from audit_logs where entity_id = $1 and action = 'session.corrected'`, [sessionId]);
    expect(audits).toHaveLength(1);

    // late goal claim after finalisation goes through approval and recompute
    const late = await db.rpc<string>(players[6], 'submit_goals', { p_session: sessionId, p_goals: 1 });
    const [lateRow] = await db.admin(`select is_late from goal_submissions where id = $1`, [late]);
    expect(lateRow.is_late).toBe(true);
    await db.rpc(host, 'review_goal_submission', { p_submission: late, p_action: 'approved' });
    const [s6] = await db.admin(`select goals from session_player_statistics where session_id = $1 and user_id = $2`, [sessionId, players[6]]);
    expect(s6.goals).toBe(1);
  });
});

describe('seasons, records, head-to-head and the scheduler', () => {
  it('computes season awards without touching career history', async () => {
    const { host, rest, groupId } = await setupGroup(10);
    const players = [host, ...rest];
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const end = new Date(today.getFullYear(), 11, 31).toISOString().slice(0, 10);
    const seasonId = await db.rpc<string>(host, 'create_season', { p_group: groupId, p_name: 'Season 1', p_starts: start, p_ends: end });
    await expectAppError(db.rpc(host, 'create_season', { p_group: groupId, p_name: 'Overlap', p_starts: start, p_ends: end }), 'season_overlap');

    for (let round = 0; round < 3; round++) {
      const sid = await createSession(host, groupId, rest, { starts_at: new Date(Date.now() - (3 - round) * 3600_000).toISOString() });
      for (const u of rest) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
      const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
      await lineup(host, f.id, players.slice(0, 5), players.slice(5));
      await db.rpc(host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 4, p_score_b: round });
      await db.rpc(host, 'complete_session', { p_session: sid });
      await db.rpc(host, 'host_record_goals', { p_session: sid, p_user: players[1], p_goals: 2 });
      for (const r of players) {
        await db.rpc(r, 'submit_ratings', {
          p_session: sid,
          p_ratings: players.filter((x) => x !== r).map((x) => ({ user_id: x, score: x === players[2] ? 9 : 6 })),
        });
        if (r !== players[2]) await db.rpc(r, 'cast_motm_vote', { p_session: sid, p_nominee: players[2] });
      }
      await db.rpc(host, 'finalise_session', { p_session: sid });
    }

    const records = await db.rpc<any>(host, 'get_group_records', { p_group: groupId });
    expect(records.sessions_played).toBe(3);
    expect(records.top_scorer.value).toBe(6);
    expect(records.most_consecutive_wins.value).toBe(3);

    const h2h = await db.rpc<any>(host, 'get_head_to_head', { p_a: players[0], p_b: players[5] });
    expect(h2h.rivalry).toMatchObject({ games: 3, a_wins: 3, b_wins: 0, draws: 0 });
    expect(h2h.teammates.games).toBe(0);
    // any two players (not including the viewer), scoped to the group
    const h2hGroup = await db.rpc<any>(players[9], 'get_head_to_head', { p_a: players[1], p_b: players[6], p_group: groupId });
    expect(h2hGroup.group_id).toBe(groupId);
    expect(h2hGroup.rivalry).toMatchObject({ games: 3, a_wins: 3 });
    expect(h2hGroup.a.goals).toBe(6);
    await expectAppError(db.rpc(players[9], 'get_head_to_head', { p_a: players[1], p_b: players[1] }), 'invalid');
    // private profile: hidden outside the group, visible to fellow members inside it
    await db.admin(`update user_preferences set profile_visibility = 'private', show_stats = false where user_id = $1`, [players[6]]);
    const outsider = await db.createUser(uniq('cmp'));
    await expectAppError(db.rpc(outsider, 'get_head_to_head', { p_a: players[1], p_b: players[6] }), 'forbidden');
    expect((await db.rpc<any>(players[9], 'get_head_to_head', { p_a: players[1], p_b: players[6], p_group: groupId })).rivalry.games).toBe(3);

    const streakLb = await db.as(host, `select * from public.get_leaderboard('streak', 'group', $1)`, [groupId]);
    expect(Number(streakLb[0].value)).toBe(3);
    const ratingLb = await db.as(host, `select * from public.get_leaderboard('rating', 'group', $1)`, [groupId]);
    expect(ratingLb[0].user_id).toBe(players[2]);

    await db.rpc(host, 'finalise_season', { p_season: seasonId });
    const awards = await db.admin(`select award, user_id from season_awards where season_id = $1`, [seasonId]);
    expect(awards).toEqual(expect.arrayContaining([
      { award: 'player_of_season', user_id: players[2] },
      { award: 'golden_boot', user_id: players[1] },
      { award: 'most_motm', user_id: players[2] },
    ]));
    const ach = await db.admin(`select 1 from player_achievements where user_id = $1 and achievement_code = 'season_champion'`, [players[2]]);
    expect(ach).toHaveLength(1);
    const career = await db.admin(`select sessions from v_career_stats where user_id = $1`, [players[2]]);
    expect(career[0].sessions).toBe(3);

    const wrapped = await db.rpc<any>(players[2], 'get_wrapped', { p_from: start, p_to: end });
    expect(wrapped).toMatchObject({ sessions: 3, motm: 3, wins: 3 });

    const tasks = await db.as(players[3], `select * from public.get_pending_tasks()`);
    expect(Array.isArray(tasks)).toBe(true);
    const home = await db.rpc<any>(players[3], 'get_home_dashboard');
    expect(home.career.sessions).toBe(3);
  });

  it('auto-finalises sessions after voting closes and sends reminders', async () => {
    const { host, rest, groupId } = await setupGroup(4);
    const players = [host, ...rest];
    const sid = await createSession(host, groupId, rest, { format_size: 5, max_attendance: 10 });
    for (const u of rest) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
    await lineup(host, f.id, players.slice(0, 2), players.slice(2));
    await db.rpc(host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 1, p_score_b: 0 });
    await db.rpc(host, 'complete_session', { p_session: sid });
    await db.admin(`update sessions set voting_closes_at = now() - interval '1 minute' where id = $1`, [sid]);
    const result = await db.admin(`select public.process_session_deadlines() r`);
    expect(result[0].r.finalised).toBeGreaterThanOrEqual(1);
    const [s] = await db.admin(`select status from sessions where id = $1`, [sid]);
    expect(s.status).toBe('finalised');
  });

  it('creates recurring sessions from templates, with fresh attendance', async () => {
    const { host, rest, groupId } = await setupGroup(3);
    const sid = await createSession(host, groupId, rest, { starts_at: new Date(Date.now() + 3600_000).toISOString() });
    await db.rpc(rest[0], 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    const tpl = await db.rpc<string>(host, 'save_session_as_template', { p_session: sid, p_name: 'Wednesday Football', p_recurrence: 'weekly', p_auto: true });
    expect(tpl).toBeTruthy();
    const r = await db.admin(`select public.process_session_deadlines() r`);
    expect(r[0].r.created).toBe(1);
    const sessions = await db.admin(`select id from sessions where template_id = $1 order by starts_at`, [tpl]);
    expect(sessions).toHaveLength(2);
    // invited again, but not assumed to be attending
    const att = await db.admin(`select user_id from session_attendance where session_id = $1`, [sessions[1].id]);
    expect(att.map((x) => x.user_id)).toEqual([host]);
    const inv = await db.admin(`select count(*)::int n from session_invitations where session_id = $1`, [sessions[1].id]);
    expect(inv[0].n).toBe(1);

    // duplicate (repeat previous session) in one tap
    const dup = await db.rpc<string>(host, 'duplicate_session', { p_session: sid, p_starts_at: new Date(Date.now() + 86400_000 * 14).toISOString() });
    expect(dup).toBeTruthy();
  });
});
