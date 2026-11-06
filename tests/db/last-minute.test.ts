/** Last-minute places (waiting-list offers in the final 24 hours) and reliability. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function session(hoursAhead: number, max: number) {
  const host = await db.createUser(uniq('lh'));
  const players = [];
  for (let i = 0; i < 4; i++) players.push(await db.createUser(uniq(`lp${i}`)));
  for (const p of players) await db.befriend(host, p);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Late FC', starts_at: new Date(Date.now() + hoursAhead * 3600_000).toISOString(), format_size: 5, invitee_ids: players },
  });
  // the host is confirmed too, so max includes them
  await db.admin(`update sessions set max_attendance = $2 where id = $1`, [sid, max]);
  for (const p of players) await db.rpc(p, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  return { host, players, sid };
}
const att = async (sid: string, uid: string) => (await db.admin(`select status, offer_expires_at, offered_at, late_withdrawal from session_attendance where session_id = $1 and user_id = $2`, [sid, uid]))[0];

describe('last-minute places', () => {
  it('more than 24 hours out, the next player still goes straight in', async () => {
    const { players: [a, , c], sid } = await session(48, 3);
    await db.rpc(a, 'respond_to_session', { p_session: sid, p_response: 'withdrawn' });
    expect((await att(sid, c)).status).toBe('confirmed');
    expect((await att(sid, a)).late_withdrawal).toBe(false);
  });

  it('in the last 24 hours, offers the place for 30 minutes and holds it', async () => {
    const { host, players: [a, b, c, d], sid } = await session(3, 3);
    expect((await att(sid, c)).status).toBe('waitlisted');
    // players message the host inside 24 hours; the host lets them drop out
    await db.rpc(host, 'release_session_player', { p_session: sid, p_user: a });
    const offered = await att(sid, c);
    expect(offered.status).toBe('waitlisted');
    expect(offered.offer_expires_at).not.toBeNull();
    expect((await att(sid, a)).late_withdrawal).toBe(true);
    const note = await db.admin(`select title from notifications where user_id = $1 and type = 'waitlist_offer'`, [c]);
    expect(note[0].title).toContain('A place just opened');

    // d can't jump in while the place is held for c
    expect(await db.rpc(d, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('waitlisted');
    // c takes it
    expect(await db.rpc(c, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
    expect((await att(sid, c)).offer_expires_at).toBeNull();

    // b drops out: d is offered it, lets it run out, nobody's left → host is told
    await db.rpc(host, 'release_session_player', { p_session: sid, p_user: b });
    expect((await att(sid, d)).offer_expires_at).not.toBeNull();
    await db.admin(`update session_attendance set offer_expires_at = now() - interval '1 minute' where session_id = $1 and user_id = $2`, [sid, d]);
    expect((await db.admin(`select public.process_waitlist_offers() n`))[0].n).toBe(1);
    expect((await att(sid, d))).toMatchObject({ status: 'waitlisted', offer_expires_at: null });
    expect(await db.admin(`select 1 from notifications where user_id = $1 and type = 'spot_open'`, [host])).toHaveLength(1);
    // a free place with nobody waiting can be taken by anyone invited
    expect(await db.rpc(a, 'respond_to_session', { p_session: sid, p_response: 'confirmed' })).toBe('confirmed');
  });

  it('saying no to an offer passes it straight on', async () => {
    const { host, players: [a, , c, d], sid } = await session(5, 3);
    await db.rpc(host, 'release_session_player', { p_session: sid, p_user: a });
    await db.rpc(c, 'respond_to_session', { p_session: sid, p_response: 'withdrawn' });
    expect((await att(sid, d)).offer_expires_at).not.toBeNull();
  });
});

describe('reliability', () => {
  it('counts turning up against no-shows and late drop-outs, from 5 commitments', async () => {
    const u = await db.createUser(uniq('rel'));
    const host = await db.createUser(uniq('relh'));
    const play = async (verification: 'verified' | 'absent' | null, late = false) => {
      const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Reliability FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5 } });
      await db.admin(`update sessions set status = 'completed' where id = $1`, [sid]);
      await db.admin(`insert into session_attendance (session_id, user_id, status, verification, late_withdrawal) values ($1, $2, $3, $4, $5)`,
        [sid, u, late ? 'withdrawn' : 'confirmed', verification ?? 'unverified', late]);
    };
    for (let i = 0; i < 3; i++) await play('verified');
    let r = await db.rpc<any>(host, 'get_reliability', { p_users: [u] });
    expect(r[u]).toMatchObject({ attended: 3, pct: null });
    await play('absent');
    await play(null, true);
    for (let i = 0; i < 3; i++) await play('verified');
    r = await db.rpc<any>(host, 'get_reliability', { p_users: [u] });
    expect(r[u]).toEqual({ attended: 6, no_shows: 1, late_drops: 1, pct: 75 });
  });
});
