/** A team's players can't be credited with more goals (or assists) than the team scored. */
import { Db, expectAppError, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function playedGame(scoreA: number, scoreB: number) {
  const host = await db.createUser(uniq('th'));
  const players: string[] = [];
  for (let i = 0; i < 6; i++) players.push(await db.createUser(uniq('tp')));
  for (const u of players) await db.befriend(host, u);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Team Limits FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, max_attendance: 10, invitee_ids: players },
  });
  for (const u of players) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  const [fx] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
  const [john, smith, third, ...b] = players;
  await db.rpc(host, 'save_lineup', {
    p_fixture: fx.id,
    p_teams: { A: { players: [john, smith, third].map((user_id) => ({ user_id })) }, B: { players: b.map((user_id) => ({ user_id })) } },
  });
  await db.rpc(host, 'record_fixture_score', { p_fixture: fx.id, p_score_a: scoreA, p_score_b: scoreB });
  return { host, sid, fixture: fx.id, john, smith, third, b };
}

describe('team goal limits', () => {
  it("John + Smith can't be credited with more than their team's 4 goals or 4 assists", async () => {
    const { host, sid, john, smith, third } = await playedGame(4, 1);
    // each claim is fine on its own (3 is within the team's 4)…
    const j = await db.rpc<string>(john, 'submit_goals', { p_session: sid, p_goals: 3, p_assists: 1 });
    const s = await db.rpc<string>(smith, 'submit_goals', { p_session: sid, p_goals: 2, p_assists: 0 });
    await db.rpc(host, 'review_goal_submission', { p_submission: j, p_action: 'approved' });
    // …but approving both would make 5
    await expect(db.rpc(host, 'review_goal_submission', { p_submission: s, p_action: 'approved' })).rejects.toMatchObject({
      hint: 'team_goals', message: expect.stringMatching(/scored 4, but its players would have 5 goals between them \(.+ 3, .+ 2\)/),
    });
    // new claims hear it straight away
    await expectAppError(db.rpc(third, 'submit_goals', { p_session: sid, p_goals: 2 }), 'team_goals');
    expect(await db.rpc<string>(third, 'submit_goals', { p_session: sid, p_goals: 1 })).toBeTruthy();

    // the host corrects Smith's goals AND assists
    await db.rpc(host, 'review_goal_submission', { p_submission: s, p_action: 'corrected', p_goals: 1, p_assists: 2, p_reason: 'One was John’s' });
    const [row] = await db.admin(`select approved_goals, approved_assists from goal_submissions where id = $1`, [s]);
    expect(row).toEqual({ approved_goals: 1, approved_assists: 2 });

    // assists are capped by the team's score too: John 1 + Smith 2 + 2 more = 5 > 4
    await expectAppError(
      db.rpc(host, 'host_record_goals', { p_session: sid, p_user: third, p_goals: 0, p_assists: 2 }),
      'team_assists',
    );
    await db.rpc(host, 'host_record_goals', { p_session: sid, p_user: third, p_goals: 0, p_assists: 1 });
    const [assists] = await db.admin(`select approved_assists from goal_submissions where session_id = $1 and user_id = $2`, [sid, third]);
    expect(assists.approved_assists).toBe(1);
  });

  it('"Approve all" approves what fits and leaves the rest for the host', async () => {
    const { host, sid, john, smith, third } = await playedGame(3, 0);
    await db.rpc<string>(john, 'submit_goals', { p_session: sid, p_goals: 2 });
    await db.rpc<string>(smith, 'submit_goals', { p_session: sid, p_goals: 1 });
    await db.rpc<string>(third, 'submit_goals', { p_session: sid, p_goals: 1 });
    expect(await db.rpc<number>(host, 'bulk_approve_goals', { p_session: sid })).toBe(2);
    const left = await db.admin(`select user_id from goal_submissions where session_id = $1 and status = 'pending'`, [sid]);
    expect(left.map((r) => r.user_id)).toEqual([third]);
  });

  it("a score can't be lowered below what the players are credited with", async () => {
    const { host, sid, fixture, john } = await playedGame(3, 2);
    const j = await db.rpc<string>(john, 'submit_goals', { p_session: sid, p_goals: 3 });
    await db.rpc(host, 'review_goal_submission', { p_submission: j, p_action: 'approved' });
    await expectAppError(db.rpc(host, 'record_fixture_score', { p_fixture: fixture, p_score_a: 2, p_score_b: 2 }), 'team_goals');
    await db.rpc(host, 'record_fixture_score', { p_fixture: fixture, p_score_a: 4, p_score_b: 2 });
  });

  it('several games: goals are split by game, for the player and the host', async () => {
    const { host, sid, fixture, john, smith } = await playedGame(2, 1);
    // game 2: John switches sides
    const f2 = await db.rpc<string>(host, 'add_fixture', { p_session: sid, p_copy_from: fixture });
    const lineup = await db.admin(`select tp.user_id, ft.side from team_players tp join fixture_teams ft on ft.id = tp.fixture_team_id where tp.fixture_id = $1`, [f2]);
    const a = lineup.filter((r) => r.side === 'A' && r.user_id !== john).map((r) => r.user_id);
    const b = [...lineup.filter((r) => r.side === 'B').map((r) => r.user_id), john];
    await db.rpc(host, 'save_lineup', { p_fixture: f2, p_teams: { A: { players: a.map((user_id) => ({ user_id })) }, B: { players: b.map((user_id) => ({ user_id })) } } });
    await db.rpc(host, 'record_fixture_score', { p_fixture: f2, p_score_a: 0, p_score_b: 3 });

    await expectAppError(db.rpc(john, 'submit_goals', { p_session: sid, p_goals: 2 }), 'split_required');
    const j = await db.rpc<string>(john, 'submit_goals', { p_session: sid, p_goals: 3, p_assists: 1, p_breakdown: [{ fixture_id: fixture, goals: 1, assists: 1 }, { fixture_id: f2, goals: 2 }] });
    // the host corrects by game too
    await expectAppError(db.rpc(host, 'review_goal_submission', { p_submission: j, p_action: 'corrected', p_goals: 2, p_reason: 'x' }), 'split_required');
    await db.rpc(host, 'review_goal_submission', {
      p_submission: j, p_action: 'corrected', p_reason: 'Only one in game 2', p_breakdown: [{ fixture_id: fixture, goals: 1, assists: 1 }, { fixture_id: f2, goals: 1, assists: 0 }],
    });
    const rows = await db.admin(`select fixture_id, goals, assists from player_goals where submission_id = $1 order by goals desc, assists desc`, [j]);
    expect(rows).toEqual([{ fixture_id: fixture, goals: 1, assists: 1 }, { fixture_id: f2, goals: 1, assists: 0 }]);
    // Smith only played game 1 for A (2 goals): John has 1 there, so 1 left
    await expectAppError(db.rpc(smith, 'submit_goals', { p_session: sid, p_goals: 2, p_breakdown: [{ fixture_id: fixture, goals: 2 }, { fixture_id: f2, goals: 0 }] }), 'team_goals');
  });

  it('own goals and goals nobody claimed count towards the team total', async () => {
    const { host, sid, fixture, john, smith } = await playedGame(4, 0);
    const [teamA] = await db.admin(`select id from fixture_teams where fixture_id = $1 and side = 'A'`, [fixture]);
    await expectAppError(db.rpc(john, 'set_team_unassigned_goals', { p_fixture_team: teamA.id, p_own_goals: 1, p_unclaimed: 0 }), 'forbidden');
    await db.rpc(host, 'set_team_unassigned_goals', { p_fixture_team: teamA.id, p_own_goals: 1, p_unclaimed: 1 });
    // 4 scored, 1 own goal, 1 nobody claimed: 2 left for the players
    await expectAppError(db.rpc(john, 'submit_goals', { p_session: sid, p_goals: 3 }), 'team_goals');
    const j = await db.rpc<string>(john, 'submit_goals', { p_session: sid, p_goals: 2, p_assists: 1 });
    await db.rpc(host, 'review_goal_submission', { p_submission: j, p_action: 'approved' });
    // own goals can't be assisted: 4 - 1 = 3 assists at most
    await expectAppError(db.rpc(host, 'host_record_goals', { p_session: sid, p_user: smith, p_goals: 0, p_assists: 3 }), 'team_assists');
    // and marking more than's left is refused
    await expectAppError(db.rpc(host, 'set_team_unassigned_goals', { p_fixture_team: teamA.id, p_own_goals: 2, p_unclaimed: 1 }), 'team_goals');
  });

  it("the next game's teams don't notify anyone (they're at the pitch)", async () => {
    const { host, sid, fixture } = await playedGame(1, 0);
    const before = await db.admin(`select count(*)::int n from notifications where type = 'lineup_announced' and data->>'session_id' = $1`, [sid]);
    const f2 = await db.rpc<string>(host, 'add_fixture', { p_session: sid });
    const all = await db.admin(`select user_id from session_attendance where session_id = $1 and status = 'confirmed' and user_id <> $2`, [sid, host]);
    const ids = all.map((r) => r.user_id);
    await db.rpc(host, 'save_lineup', { p_fixture: f2, p_teams: { A: { players: ids.slice(0, 3).map((user_id) => ({ user_id })) }, B: { players: ids.slice(3).map((user_id) => ({ user_id })) } } });
    const after = await db.admin(`select count(*)::int n from notifications where type = 'lineup_announced' and data->>'session_id' = $1`, [sid]);
    expect(after[0].n).toBe(before[0].n);
    expect(fixture).toBeTruthy();
  });

  it('several games: the award is Player of the Night; notifications have no emoji', async () => {
    const { host, sid, fixture } = await playedGame(1, 0);
    expect(await db.rpc<string>(host, 'motm_title', { p_session: sid })).toBe('Man of the Match');
    await db.rpc<string>(host, 'add_fixture', { p_session: sid, p_copy_from: fixture });
    await db.admin(`update sessions set starts_at = date_trunc('day', now()) + interval '19 hours' where id = $1`, [sid]);
    expect(await db.rpc<string>(host, 'motm_title', { p_session: sid })).toBe('Player of the Night');
    await db.admin(`select public.notify($1, 'voting_open', 'Full time! Vote for Man of the Match', 'Pick the Man of the Match ✅', jsonb_build_object('session_id', $2::text))`, [host, sid]);
    const [n] = await db.admin(`select title, body from notifications where user_id = $1 and type = 'voting_open' order by created_at desc limit 1`, [host]);
    expect(n).toEqual({ title: 'Full time! Vote for Player of the Night', body: 'Pick the Player of the Night' });
    expect((await db.admin(`select public.strip_edge_emoji('⚽ Sunday FC needs 2 players') t`))[0].t).toBe('Sunday FC needs 2 players');
  });

  it('a game nobody else turned up to is cancelled automatically afterwards', async () => {
    const host = await db.createUser(uniq('lonely'));
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Lonely FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5 } });
    const busy = await playedGame(1, 0);
    // both games are long over
    await db.admin(`update sessions set starts_at = now() - interval '6 hours' where id = any($1)`, [[sid, busy.sid]]);
    expect((await db.admin(`select public.auto_cancel_empty_games() n`))[0].n).toBeGreaterThanOrEqual(1);
    expect((await db.admin(`select status from sessions where id = $1`, [sid]))[0].status).toBe('cancelled');
    // a game that was played is left alone
    expect((await db.admin(`select status from sessions where id = $1`, [busy.sid]))[0].status).not.toBe('cancelled');
    const [n] = await db.admin(`select title from notifications where user_id = $1 and type = 'session_cancelled'`, [host]);
    expect(n.title).toBe('Lonely FC was cancelled');
  });

  it('hosts can change their own tally until the game is finalised', async () => {
    const { host, sid, fixture, john, smith } = await playedGame(3, 0);
    // the host plays too: put them on team A
    await db.admin(`insert into session_attendance (session_id, user_id, status, verification) values ($1, $2, 'confirmed', 'verified') on conflict (session_id, user_id) do update set status = 'confirmed', verification = 'verified'`, [sid, host]);
    const [teamA] = await db.admin(`select id from fixture_teams where fixture_id = $1 and side = 'A'`, [fixture]);
    await db.admin(`insert into team_players (fixture_team_id, fixture_id, user_id, position, is_goalkeeper, is_substitute, sort_order) values ($1, $2, $3, 'ANY', false, false, 9)`, [teamA.id, fixture, host]);
    await db.rpc(host, 'submit_goals', { p_session: sid, p_goals: 2 });
    await db.rpc(host, 'submit_goals', { p_session: sid, p_goals: 1, p_assists: 1 });
    const [mine] = await db.admin(`select status, approved_goals, approved_assists from goal_submissions where session_id = $1 and user_id = $2`, [sid, host]);
    expect(mine).toEqual({ status: 'approved', approved_goals: 1, approved_assists: 1 });
    // players still can't change an approved claim themselves
    const j = await db.rpc<string>(john, 'submit_goals', { p_session: sid, p_goals: 1 });
    await db.rpc(host, 'review_goal_submission', { p_submission: j, p_action: 'approved' });
    await expectAppError(db.rpc(john, 'submit_goals', { p_session: sid, p_goals: 0 }), 'already_submitted');
    expect(smith).toBeTruthy();
  });

  it('the feed names the award Player of the Night when several games were played', async () => {
    const { host, sid, fixture, john } = await playedGame(1, 0);
    await db.rpc<string>(host, 'add_fixture', { p_session: sid, p_copy_from: fixture });
    await db.admin(`update sessions set starts_at = date_trunc('day', now()) + interval '20 hours' where id = $1`, [sid]);
    await db.admin(`select public.post_activity($1, 'motm', '{"session_name":"Team Limits FC","votes":3,"shared":false}'::jsonb, null, $2)`, [john, sid]);
    const [row] = await db.admin(`select payload->>'award' award from activity_feed where session_id = $1 and type = 'motm'`, [sid]);
    expect(row.award).toBe('Player of the Night');
  });
});
