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
});
