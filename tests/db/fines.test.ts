/**
 * Late fines: escalation (£1 doubling, capped at £8), reset after 3 on-time paid sessions,
 * free sessions ignored, fines added to the next bill in the group, host overrides,
 * one-off fine requests and visibility.
 */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

let dayOffset = 1200; // minutes before now; each game is a minute later than the last

async function setup(opts: { enabled?: boolean } = {}) {
  const host = await db.createUser(uniq('h'));
  const p = await db.createUser(uniq('p'));
  const q = await db.createUser(uniq('q'));
  for (const u of [p, q]) await db.befriend(host, u);
  const g = await db.rpc<string>(host, 'create_group', { p_name: 'Fines FC', p_visibility: 'private', p_join_policy: 'request' });
  await db.rpc(host, 'add_group_members', { p_group: g, p_users: [p, q] });
  if (opts.enabled !== false) {
    await db.as(host, `update group_settings set late_fines_enabled = true where group_id = $1`, [g]);
  }
  return { host, p, q, g };
}

/** Play one session; `late` players are marked late by the host before full time. */
async function play(ctx: { host: string; p: string; q: string; g: string }, mode: 'upfront' | 'after' | 'free', late: string[]) {
  dayOffset -= 1;
  const sid = await db.rpc<string>(ctx.host, 'create_session', {
    p: {
      name: `Fines ${dayOffset}`, group_id: ctx.g, starts_at: new Date(Date.now() - dayOffset * 60_000).toISOString(), format_size: 5,
      invitee_ids: [ctx.p, ctx.q], payment_mode: mode, price_pence: mode === 'free' ? 0 : 900,
    },
  });
  for (const u of [ctx.p, ctx.q]) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
  await db.rpc(ctx.host, 'save_lineup', { p_fixture: f.id, p_teams: { A: { players: [{ user_id: ctx.host }, { user_id: ctx.p }] }, B: { players: [{ user_id: ctx.q }] } } });
  for (const u of late) await db.rpc(ctx.host, 'set_attendance_verification', { p_session: sid, p_user: u, p_verification: 'verified', p_late: true });
  await db.rpc(ctx.host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 1, p_score_b: 0 });
  await db.rpc(ctx.host, 'complete_session', { p_session: sid });
  return sid;
}

const fineOf = async (sid: string, user: string) =>
  (await db.admin(`select level, amount_pence, status, payment_id from late_fines where session_id = $1 and user_id = $2`, [sid, user]))[0];

describe('late fines', () => {
  it('doubles from £1, caps at £8, and resets after 3 on-time sessions in a row', async () => {
    const ctx = await setup();
    const amounts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const sid = await play(ctx, 'upfront', [ctx.p]);
      amounts.push((await fineOf(sid, ctx.p)).amount_pence);
    }
    expect(amounts).toEqual([100, 200, 400, 800, 800]);

    // two on-time sessions are not enough to reset…
    await play(ctx, 'upfront', []);
    await play(ctx, 'upfront', []);
    let s = await play(ctx, 'upfront', [ctx.p]);
    expect((await fineOf(s, ctx.p)).amount_pence).toBe(800);

    // …three in a row are
    for (let i = 0; i < 3; i++) await play(ctx, 'upfront', []);
    s = await play(ctx, 'upfront', [ctx.p]);
    expect((await fineOf(s, ctx.p)).amount_pence).toBe(100);

    const status = await db.rpc<any>(ctx.p, 'get_late_status', { p_group: ctx.g });
    expect(status).toMatchObject({ enabled: true, level: 1, next_fine_pence: 200, sessions_to_reset: 3, cap_pence: 800 });
    // the other player was never late and has no fines
    expect(await fineOf(s, ctx.q)).toBeUndefined();
  });

  it('ignores free sessions and groups with fines switched off; never fines the host', async () => {
    const ctx = await setup();
    const free = await play(ctx, 'free', [ctx.p]);
    expect(await fineOf(free, ctx.p)).toBeUndefined();
    const paid = await play(ctx, 'upfront', [ctx.p]);
    expect((await fineOf(paid, ctx.p)).amount_pence).toBe(100); // free lateness didn't escalate

    const off = await setup({ enabled: false });
    const sid = await play(off, 'upfront', [off.p]);
    expect(await fineOf(sid, off.p)).toBeUndefined();
  });

  it('pay-after: the fine is on the same session’s bill', async () => {
    const ctx = await setup();
    const sid = await play(ctx, 'after', [ctx.p]);
    const [pay] = await db.admin(`select id, amount_pence from payments where session_id = $1 and payer_id = $2`, [sid, ctx.p]);
    expect(pay.amount_pence).toBe(1000); // £9 + £1
    expect(await fineOf(sid, ctx.p)).toMatchObject({ status: 'included', payment_id: pay.id });
    const [other] = await db.admin(`select amount_pence from payments where session_id = $1 and payer_id = $2`, [sid, ctx.q]);
    expect(other.amount_pence).toBe(900);
    // paying the bill pays the fine
    await db.admin(`update payments set status = 'paid' where id = $1`, [pay.id]);
    expect((await fineOf(sid, ctx.p)).status).toBe('paid');
    const summary = await db.rpc<any>(ctx.host, 'get_payment_summary', { p_session: sid });
    expect(summary.players.find((r: any) => r.user_id === ctx.p).fines_pence).toBe(100);
  });

  it('upfront: the fine is added to the next session bill in that group', async () => {
    const ctx = await setup();
    const first = await play(ctx, 'upfront', [ctx.p]);
    expect((await fineOf(first, ctx.p)).status).toBe('owed');
    // next upfront session: the checkout creates the bill — it picks up the owed fine
    dayOffset -= 1;
    const next = await db.rpc<string>(ctx.host, 'create_session', {
      p: { name: 'Next', group_id: ctx.g, starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, invitee_ids: [ctx.p], payment_mode: 'upfront', price_pence: 900 },
    });
    await db.admin(`insert into payments (session_id, payer_id, payee_id, amount_pence, mode, status) values ($1, $2, $3, 900, 'upfront', 'pending')`, [next, ctx.p, ctx.host]);
    const [bill] = await db.admin(`select id, amount_pence from payments where session_id = $1 and payer_id = $2`, [next, ctx.p]);
    expect(bill.amount_pence).toBe(1000);
    expect((await fineOf(first, ctx.p)).payment_id).toBe(bill.id);
    // a released hold sends the fine back to "owed"
    await db.admin(`update payments set status = 'authorised' where id = $1`, [bill.id]);
    await db.admin(`update payments set status = 'cancelled' where id = $1`, [bill.id]);
    expect(await fineOf(first, ctx.p)).toMatchObject({ status: 'owed', payment_id: null });
  });

  it('host can waive, adjust, mark cash-paid; corrections remove fines; waived lateness does not escalate', async () => {
    const ctx = await setup();
    const s1 = await play(ctx, 'after', [ctx.p]);
    const f1 = (await db.admin(`select id from late_fines where session_id = $1`, [s1]))[0].id;
    await expectAppError(db.rpc(ctx.q, 'update_late_fine', { p_fine: f1, p_action: 'waive' }), 'forbidden');
    await db.rpc(ctx.host, 'update_late_fine', { p_fine: f1, p_action: 'adjust', p_amount: 50, p_note: 'Only 2 minutes' });
    expect((await db.admin(`select amount_pence from payments where session_id = $1 and payer_id = $2`, [s1, ctx.p]))[0].amount_pence).toBe(950);
    await db.rpc(ctx.host, 'update_late_fine', { p_fine: f1, p_action: 'waive', p_note: 'Traffic accident' });
    expect((await db.admin(`select amount_pence from payments where session_id = $1 and payer_id = $2`, [s1, ctx.p]))[0].amount_pence).toBe(900);
    expect(await fineOf(s1, ctx.p)).toMatchObject({ status: 'waived', amount_pence: 0, payment_id: null });
    const [n] = await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'late_fine_waived'`, [ctx.p]);
    expect(n.n).toBe(1);

    // waived lateness doesn't count: the next late is still £1
    const s2 = await play(ctx, 'upfront', [ctx.p]);
    expect((await fineOf(s2, ctx.p)).amount_pence).toBe(100);

    // host corrects "late" → the unpaid fine disappears
    await db.rpc(ctx.host, 'set_attendance_verification', { p_session: s2, p_user: ctx.p, p_verification: 'verified', p_late: false });
    expect(await fineOf(s2, ctx.p)).toBeUndefined();
    await db.rpc(ctx.host, 'set_attendance_verification', { p_session: s2, p_user: ctx.p, p_verification: 'verified', p_late: true });
    const f2 = (await db.admin(`select id from late_fines where session_id = $1`, [s2]))[0].id;
    await db.rpc(ctx.host, 'update_late_fine', { p_fine: f2, p_action: 'paid_cash' });
    expect(await fineOf(s2, ctx.p)).toMatchObject({ status: 'paid' });
    await expectAppError(db.rpc(ctx.host, 'update_late_fine', { p_fine: f2, p_action: 'waive' }), 'locked');
  });

  it('admins can request a one-off payment for owed fines; visibility is limited', async () => {
    const ctx = await setup();
    await play(ctx, 'upfront', [ctx.p]); // £1 owed
    await play(ctx, 'upfront', [ctx.p]); // £2 owed
    await expectAppError(db.rpc(ctx.q, 'request_late_fine_payment', { p_group: ctx.g, p_user: ctx.p }), 'forbidden');
    const pid = await db.rpc<string>(ctx.host, 'request_late_fine_payment', { p_group: ctx.g, p_user: ctx.p });
    const [pay] = await db.admin(`select kind, amount_pence, status from payments where id = $1`, [pid]);
    expect(pay).toEqual({ kind: 'fine', amount_pence: 300, status: 'unpaid' });
    const owed = await db.admin(`select count(*)::int n from late_fines where group_id = $1 and user_id = $2 and status = 'included'`, [ctx.g, ctx.p]);
    expect(owed[0].n).toBe(2);
    // a fine payment does not pick up other fines twice, and paying settles them
    await db.admin(`update payments set status = 'paid' where id = $1`, [pid]);
    expect((await db.admin(`select count(*)::int n from late_fines where group_id = $1 and user_id = $2 and status = 'paid'`, [ctx.g, ctx.p]))[0].n).toBe(2);

    // players see their own fines; other members don't; admins see the group list
    expect(await db.as(ctx.p, `select id from late_fines where group_id = $1`, [ctx.g])).toHaveLength(2);
    expect(await db.as(ctx.q, `select id from late_fines where group_id = $1`, [ctx.g])).toHaveLength(0);
    await expectAppError(db.rpc(ctx.q, 'get_late_status', { p_group: ctx.g, p_user: ctx.p }), 'forbidden');
    const list = await db.as(ctx.host, `select * from public.get_group_fines($1)`, [ctx.g]);
    expect(list).toHaveLength(2);
    await expectAppError(db.rpc(ctx.q, 'get_group_fines', { p_group: ctx.g }), 'forbidden');
    // clients can't write fines directly
    await expect(db.as(ctx.p, `update late_fines set amount_pence = 0 where user_id = $1`, [ctx.p])).rejects.toThrow(/permission denied/);
  });

  it('a cash payment for the next session settles owed fines too', async () => {
    const ctx = await setup();
    const first = await play(ctx, 'upfront', [ctx.p]);
    const next = await db.rpc<string>(ctx.host, 'create_session', {
      p: { name: 'Cash', group_id: ctx.g, starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, invitee_ids: [ctx.p], payment_mode: 'upfront', price_pence: 900 },
    });
    await db.rpc(ctx.host, 'record_cash_payment', { p_session: next, p_user: ctx.p });
    const [bill] = await db.admin(`select amount_pence, status, method from payments where session_id = $1 and payer_id = $2`, [next, ctx.p]);
    expect(bill).toEqual({ amount_pence: 1000, status: 'paid', method: 'cash' });
    expect((await fineOf(first, ctx.p)).status).toBe('paid');
  });
});

describe('booking fee settings', () => {
  it('are readable by everyone and writable by no client', async () => {
    const u = await db.createUser(uniq('fee'));
    expect(await db.as(null, `select booking_fee_min_pence from app_settings`)).toEqual([{ booking_fee_min_pence: 50 }]);
    expect(await db.as(u, `select booking_fee_rate_bps, booking_fee_fixed_pence from app_settings`)).toEqual([{ booking_fee_rate_bps: 150, booking_fee_fixed_pence: 20 }]);
    await expect(db.as(u, `update app_settings set booking_fee_min_pence = 0`)).rejects.toThrow(/permission denied/);
  });
});
