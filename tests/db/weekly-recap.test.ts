/** Sunday "your week" recap: who gets one, what it says, and that it's sent once a week. */
import { Db, uniq } from './helpers';

const db = new Db();
// Manchester: away from the London postcode other test files search around
const FAR = { postcode: 'M1 1AE', latitude: 53.4808, longitude: -2.2426 };
beforeAll(() => db.connect());
afterAll(() => db.end());

/** One finalised session: team A vs team B, one game per score. */
async function play(host: string, a: string[], b: string[], scores: [number, number][]) {
  const all = [...a, ...b].filter((u) => u !== host);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Recap FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, invitee_ids: all, mode: 'multi', ...FAR },
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
  // it was played yesterday
  await db.admin(`update session_player_statistics set played_at = now() - interval '1 day' where session_id = $1`, [sid]);
  return sid;
}

const recaps = (user: string) => db.admin(`select title, body, data from notifications where user_id = $1 and type = 'week_recap' order by created_at`, [user]);

describe('weekly recap', () => {
  it('sums up the week: results, goals, rating trend, best link-up and the next game', async () => {
    const [me, mate, r1, r2] = [await db.createUser(uniq('wr')), await db.createUser(uniq('wm')), await db.createUser(uniq('w1')), await db.createUser(uniq('w2'))];
    for (const u of [mate, r1, r2]) await db.befriend(me, u);
    const sid = await play(me, [me, mate], [r1, r2], [[2, 0], [1, 1], [3, 1]]);
    // a couple of goals and a rating for this week
    await db.admin(`update session_player_statistics set goals = 2, assists = 1, rating_avg = 7.6, rating_eligible = true where session_id = $1 and user_id = $2`, [sid, me]);
    // already in for next week's game
    const next = await db.rpc<string>(me, 'create_session', { p: { name: 'Wednesday Football', starts_at: new Date(Date.now() + 3 * 86400_000).toISOString(), format_size: 5, ...FAR } });
    await db.admin(`insert into session_attendance (session_id, user_id, status) values ($1, $2, 'confirmed') on conflict (session_id, user_id) do update set status = 'confirmed'`, [next, me]);
    // an older, lower-rated game (more than a week ago)
    const old = await db.rpc<string>(me, 'create_session', { p: { name: 'Last month', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, ...FAR } });
    await db.admin(`insert into session_player_statistics (session_id, user_id, played_at, fixtures_played, rating_avg, rating_eligible)
                    values ($1, $2, now() - interval '20 days', 1, 7.1, true)`, [old, me]);
    await db.admin(`update sessions set status = 'finalised', starts_at = now() - interval '20 days' where id = $1`, [old]);

    const v = await db.admin<{ r: any }>(`select public.weekly_recap_for($1) as r`, [me]);
    expect(v[0].r.title).toBe('Your week: 1 game, 2W 1D 0L');
    expect(v[0].r.body).toContain('2 goals, 1 assist');
    expect(v[0].r.body).toContain('Best with');
    expect(v[0].r.body).toContain('(67% wins)');
    expect(v[0].r.body).toMatch(/Next: Wednesday Football, \w{3} \d{2}:\d{2}\.$/);
    expect(v[0].r.body).toContain('Rating 7.6 (up from 7.1)');
  });

  it('is sent once a week to players with something to report, and respects the setting', async () => {
    const [host, p, idle, off] = [await db.createUser(uniq('wh')), await db.createUser(uniq('wp')), await db.createUser(uniq('wi')), await db.createUser(uniq('wo'))];
    for (const u of [p, off]) await db.befriend(host, u);
    // everyone here has finished signing up (the recap skips half-made accounts)
    await db.admin(`update profiles set onboarded = true where id = any($1::uuid[])`, [[host, p, idle, off]]);
    await play(host, [host], [p, off], [[0, 1]]);
    await db.admin(`update user_preferences set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || '{"week_recap": false}' where user_id = $1`, [off]);

    const sent = (await db.admin<{ n: number }>(`select public.send_weekly_recaps() as n`))[0].n;
    expect(sent).toBeGreaterThanOrEqual(2);
    expect(await recaps(p)).toEqual([expect.objectContaining({ title: 'Your week: 1 game, 1W 0D 0L', data: { recap: true } })]);
    expect(await recaps(host)).toHaveLength(1);
    expect(await recaps(idle)).toEqual([]); // nothing played, nothing coming up
    expect(await recaps(off)).toEqual([]); // switched off in notification settings

    await db.admin(`select public.send_weekly_recaps()`);
    expect(await recaps(p)).toHaveLength(1); // not twice in a week
  });

  it('only the scheduler can send or read recaps', async () => {
    const u = await db.createUser(uniq('ws'));
    await expect(db.rpc(u, 'send_weekly_recaps', {})).rejects.toThrow(/permission denied/);
    await expect(db.rpc(u, 'weekly_recap_for', { p_user: u })).rejects.toThrow(/permission denied/);
  });
});
