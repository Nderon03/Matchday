/** Link previews for shared invites, and the private calendar feed. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

describe('link previews', () => {
  it('give a public summary of a valid invite, and nothing for a bad one', async () => {
    const host = await db.createUser(uniq('lp'));
    const p = await db.createUser(uniq('lq'));
    await db.befriend(host, p);
    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Preview FC', starts_at: new Date(Date.now() + 86400_000 * 3).toISOString(), format_size: 5, venue: 'Riverside', invitee_ids: [p] },
    });
    await db.admin(`update sessions set max_attendance = 10 where id = $1`, [sid]);
    await db.rpc(p, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    const code = await db.rpc<string>(host, 'create_invite_link', { p_kind: 'session', p_target: sid });
    // not signed in (that's how WhatsApp fetches it)
    const r = await db.rpc<any>(null, 'get_link_preview', { p_code: code });
    expect(r).toMatchObject({ kind: 'session', name: 'Preview FC', venue: 'Riverside', format_size: 5, places_left: 8, status: 'scheduled' });
    expect(JSON.stringify(r)).not.toContain(p); // never who's playing
    expect(await db.rpc(null, 'get_link_preview', { p_code: 'nope' })).toBeNull();
    await db.admin(`update invite_links set expires_at = now() - interval '1 minute' where code = $1`, [code]);
    expect(await db.rpc(null, 'get_link_preview', { p_code: code })).toBeNull();
  });
});

describe('calendar feed', () => {
  it('lists my games (not cancelled ones) behind a private token that can be reset', async () => {
    const host = await db.createUser(uniq('ch'));
    const me = await db.createUser(uniq('cm'));
    const other = await db.createUser(uniq('co'));
    await db.befriend(host, me);
    const mk = async (name: string, days: number) => db.rpc<string>(host, 'create_session', {
      p: { name, starts_at: new Date(Date.now() + days * 86400_000).toISOString(), format_size: 5, invitee_ids: [me] },
    });
    const playing = await mk('Playing FC', 2);
    const invited = await mk('Invited FC', 4);
    const cancelled = await mk('Cancelled FC', 6);
    await db.rpc(me, 'respond_to_session', { p_session: playing, p_response: 'confirmed' });
    await db.admin(`update sessions set status = 'cancelled' where id = $1`, [cancelled]);

    const token = await db.rpc<string>(me, 'get_calendar_feed');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await db.rpc<string>(me, 'get_calendar_feed')).toBe(token);
    const rows = await db.admin(`select session_id, my_status from calendar_feed_events($1)`, [token]);
    expect(rows).toEqual([{ session_id: playing, my_status: 'confirmed' }, { session_id: invited, my_status: 'invited' }]);
    // other people get nothing from my token's table, and players can't read the token table
    await expect(db.as(other, `select * from calendar_feed_events($1)`, [token])).rejects.toThrow(/permission denied/);
    await expect(db.as(me, `select * from calendar_feeds`)).rejects.toThrow(/permission denied/);
    // resetting stops the old link
    const fresh = await db.rpc<string>(me, 'get_calendar_feed', { p_reset: true });
    expect(fresh).not.toBe(token);
    expect(await db.admin(`select * from calendar_feed_events($1)`, [token])).toHaveLength(0);
  });
});

describe('invite landing preview', () => {
  it('shows a friend invite as their card, with mutual friends, and respects privacy', async () => {
    const ned = await db.createUser(uniq('ned'));
    const me = await db.createUser(uniq('me'));
    const mutual = await db.createUser(uniq('mu'));
    await db.befriend(ned, mutual);
    await db.befriend(me, mutual);
    await db.admin(`update profiles set nationality = 'XK', supported_club = 'arsenal' where id = $1`, [ned]);
    const code = await db.rpc<string>(ned, 'create_invite_link', { p_kind: 'friend' });
    const r = await db.rpc<any>(me, 'get_invite', { p_code: code });
    expect(r.preview).toMatchObject({ id: ned, nationality: 'XK', supported_club: 'arsenal', already_friends: false, is_self: false, mutual_count: 1, medal_points: 0 });
    expect(r.preview.mutual).toHaveLength(1);
    await db.admin(`update user_preferences set profile_visibility = 'private', show_stats = false where user_id = $1`, [ned]);
    expect((await db.rpc<any>(me, 'get_invite', { p_code: code })).preview.stats).toBeNull();
    // accepting makes you friends, and the preview then says so
    await db.rpc(me, 'accept_invite', { p_code: code });
    expect((await db.rpc<any>(me, 'get_invite', { p_code: code })).preview.already_friends).toBe(true);
  });
});
