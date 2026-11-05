/**
 * Guest fees: the player who brings guests pays for them on their own bill, a separate guest-fee bill
 * covers guests added after paying, and unpaid guest fees block the next game like any other bill.
 */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function setup(mode: 'after' | 'upfront', startsInMinutes = 24 * 60) {
  const host = await db.createUser(uniq('h'));
  const p = await db.createUser(uniq('p'));
  for (const u of [p]) await db.befriend(host, u);
  const g = await db.rpc<string>(host, 'create_group', { p_name: 'Guest FC', p_visibility: 'private', p_join_policy: 'request' });
  await db.rpc(host, 'add_group_members', { p_group: g, p_users: [p] });
  for (const u of [p]) await db.rpc(u, 'respond_group_invite', { p_group: g, p_accept: true });
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Guest game', group_id: g, starts_at: new Date(Date.now() + startsInMinutes * 60_000).toISOString(), format_size: 5, invitee_ids: [p], payment_mode: mode, price_pence: 600 },
  });
  await db.rpc(p, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  return { host, p, g, sid };
}

const bills = (sid: string, user: string) =>
  db.admin(`select kind, status, amount_pence, guest_count from payments where session_id = $1 and payer_id = $2 order by kind`, [sid, user]);

async function finish(host: string, sid: string, players: string[]) {
  const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
  await db.rpc(host, 'save_lineup', { p_fixture: f.id, p_teams: { A: { players: [{ user_id: host }] }, B: { players: players.map((user_id) => ({ user_id })) } } });
  await db.admin(`update sessions set starts_at = now() - interval '2 hours' where id = $1`, [sid]);
  await db.rpc(host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 1, p_score_b: 0 });
  await db.rpc(host, 'complete_session', { p_session: sid });
}

describe('guest fees', () => {
  it('pay after: the player is billed for themselves and their guests in one bill', async () => {
    const { host, p, g, sid } = await setup('after');
    await db.rpc(p, 'add_session_guest', { p_session: sid, p_name: 'Dave' });
    await db.rpc(p, 'add_session_guest', { p_session: sid, p_name: 'Sam' });
    await db.rpc(host, 'add_session_guest', { p_session: sid, p_name: 'Host mate' }); // host's guests are free
    await finish(host, sid, [p]);
    expect(await bills(sid, p)).toEqual([{ kind: 'session', status: 'unpaid', amount_pence: 1800, guest_count: 2 }]);
    expect(await bills(sid, host)).toEqual([]);

    // unpaid guest fees block the next game too
    const next = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Next', group_id: g, starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, invitee_ids: [p], payment_mode: 'after', price_pence: 600 },
    });
    await expectAppError(db.rpc(p, 'respond_to_session', { p_session: next, p_response: 'confirmed' }), 'unpaid_balance');
    await db.rpc(host, 'record_cash_payment', { p_session: sid, p_user: p });
    expect(await db.rpc(p, 'respond_to_session', { p_session: next, p_response: 'confirmed' })).toBe('confirmed');
  });

  it('upfront: guests ride on the unpaid bill and come off it if they drop out', async () => {
    const { host, p, sid } = await setup('upfront');
    await db.admin(`insert into payments (session_id, payer_id, payee_id, amount_pence, mode, status) values ($1, $2, $3, 600, 'upfront', 'pending')`, [sid, p, host]);
    const [guest] = [await db.rpc<{ id: string }>(p, 'add_session_guest', { p_session: sid, p_name: 'Dave' })];
    expect(await bills(sid, p)).toEqual([{ kind: 'session', status: 'pending', amount_pence: 1200, guest_count: 1 }]);
    await db.rpc(p, 'remove_session_guest', { p_guest: guest.id });
    expect(await bills(sid, p)).toEqual([{ kind: 'session', status: 'pending', amount_pence: 600, guest_count: 0 }]);
  });

  it('a guest added after paying gets a separate guest-fee bill; cash covers it', async () => {
    const { host, p, sid } = await setup('upfront');
    await db.admin(`insert into payments (session_id, payer_id, payee_id, amount_pence, mode, status) values ($1, $2, $3, 600, 'upfront', 'authorised')`, [sid, p, host]);
    const guest = await db.rpc<{ id: string }>(p, 'add_session_guest', { p_session: sid, p_name: 'Dave' });
    expect(await bills(sid, p)).toEqual([
      { kind: 'guest', status: 'unpaid', amount_pence: 600, guest_count: 1 },
      { kind: 'session', status: 'authorised', amount_pence: 600, guest_count: 0 },
    ]);
    const note = await db.admin(`select title from notifications where user_id = $1 and title like 'Guest fee%'`, [p]);
    expect(note).toHaveLength(1);
    // second guest increases the guest-fee bill
    await db.rpc(p, 'add_session_guest', { p_session: sid, p_name: 'Sam' });
    expect((await bills(sid, p))[0]).toMatchObject({ kind: 'guest', amount_pence: 1200, guest_count: 2 });
    // guest drops out → guest fee shrinks
    await db.rpc(p, 'remove_session_guest', { p_guest: guest.id });
    expect((await bills(sid, p))[0]).toMatchObject({ kind: 'guest', amount_pence: 600, guest_count: 1 });
    // host takes cash for the guest
    await db.rpc(host, 'record_cash_payment', { p_session: sid, p_user: p });
    expect((await bills(sid, p))[0]).toMatchObject({ kind: 'guest', status: 'paid' });
    const summary = await db.rpc<any>(host, 'get_payment_summary', { p_session: sid });
    expect(summary.players[0]).toMatchObject({ guest_status: 'paid', guest_amount_pence: 600 });
  });

  it('a new bill created after guests were added includes them (e.g. upfront non-payer at full time)', async () => {
    const { host, p, sid } = await setup('upfront');
    await db.rpc(p, 'add_session_guest', { p_session: sid, p_name: 'Dave' });
    await finish(host, sid, [p]);
    expect(await bills(sid, p)).toEqual([{ kind: 'session', status: 'unpaid', amount_pence: 1200, guest_count: 1 }]);
  });

  it('dropping out takes your guests with you', async () => {
    const { p, sid } = await setup('after');
    await db.rpc(p, 'add_session_guest', { p_session: sid, p_name: 'Dave' });
    await db.rpc(p, 'respond_to_session', { p_session: sid, p_response: 'declined' });
    const guests = await db.admin(`select status from session_guests where session_id = $1`, [sid]);
    expect(guests).toEqual([{ status: 'withdrawn' }]);
  });
});
