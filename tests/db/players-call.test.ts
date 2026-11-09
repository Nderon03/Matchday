/** "Need players": a short game calls friends of the squad, then players nearby; not spammable. */
import { Db, expectAppError, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

describe('need players', () => {
  it('invites friends of the squad and nearby regulars, once every few hours', async () => {
    const host = await db.createUser(uniq('ch'));
    const mate = await db.createUser(uniq('cm'));
    const mateFriend = await db.createUser(uniq('cf'));
    const local = await db.createUser(uniq('cl'));
    const faraway = await db.createUser(uniq('cx'));
    const blocked = await db.createUser(uniq('cb'));
    // only people who've finished setting up their profile get calls
    await db.admin(`update profiles set onboarded = true where id = any($1)`, [[host, mate, mateFriend, local, faraway, blocked]]);
    await db.befriend(host, mate);
    await db.befriend(mate, mateFriend);
    await db.befriend(mate, blocked);
    await db.admin(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [host, blocked]);
    // a past game near the venue for `local`, and one far away for `faraway`
    const past = async (u: string, lat: number, lng: number) => {
      const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Past FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5 } });
      await db.admin(`update sessions set status = 'finalised', starts_at = now() - interval '10 days', latitude = $2, longitude = $3 where id = $1`, [sid, lat, lng]);
      await db.admin(`insert into session_attendance (session_id, user_id, status, verification) values ($1, $2, 'confirmed', 'verified')`, [sid, u]);
    };
    await past(local, 51.615, -0.245);
    await past(faraway, 53.48, -2.24); // Manchester

    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Short FC', starts_at: new Date(Date.now() + 2 * 86400_000).toISOString(), format_size: 5, invitee_ids: [mate] },
    });
    await db.admin(`update sessions set latitude = 51.6142, longitude = -0.2447 where id = $1`, [sid]);
    await db.rpc(mate, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });

    const preview = await db.rpc<any>(host, 'preview_players_call', { p_session: sid });
    expect(preview).toMatchObject({ places_left: 8, friends: 1, nearby: 1, next_call_at: null });
    await expectAppError(db.rpc(mate, 'call_for_players', { p_session: sid }), 'forbidden');

    expect(await db.rpc(host, 'call_for_players', { p_session: sid, p_message: 'Bring a dark top' })).toBe(2);
    const notes = await db.admin(`select user_id, title, body from notifications where type = 'players_needed' and data->>'session_id' = $1`, [sid]);
    expect(notes.map((n) => n.user_id).sort()).toEqual([mateFriend, local].sort());
    expect(notes[0].title).toBe('Short FC needs 8 players');
    expect(notes[0].body).toContain('Bring a dark top');
    // invited, so they can join a game they couldn't see before
    expect(await db.rpc(mateFriend, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    await expectAppError(db.rpc(host, 'call_for_players', { p_session: sid }), 'too_soon');
    expect((await db.rpc<any>(host, 'preview_players_call', { p_session: sid })).next_call_at).not.toBeNull();
  });
});
