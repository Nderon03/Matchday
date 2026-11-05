/**
 * Settle up before playing: unpaid bills block joining the next game in the group (host can still
 * add players directly), upfront non-payers are billed at full time, reminders, balances.
 */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function setup() {
  const host = await db.createUser(uniq('h'));
  const p = await db.createUser(uniq('p'));
  const q = await db.createUser(uniq('q'));
  for (const u of [p, q]) await db.befriend(host, u);
  const g = await db.rpc<string>(host, 'create_group', { p_name: 'Settle FC', p_visibility: 'private', p_join_policy: 'request' });
  await db.rpc(host, 'add_group_members', { p_group: g, p_users: [p, q] });
  for (const u of [p, q]) await db.rpc(u, 'respond_group_invite', { p_group: g, p_accept: true });
  return { host, p, q, g };
}

let minutes = 600;
async function playAndComplete(ctx: { host: string; p: string; q: string; g: string }, mode: 'after' | 'upfront', paidUpfront: string[] = []) {
  minutes -= 1;
  const sid = await db.rpc<string>(ctx.host, 'create_session', {
    p: { name: `Settle ${minutes}`, group_id: ctx.g, starts_at: new Date(Date.now() - minutes * 60_000).toISOString(), format_size: 5, invitee_ids: [ctx.p, ctx.q], payment_mode: mode, price_pence: 700 },
  });
  for (const u of [ctx.p, ctx.q]) await db.rpc(u, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  for (const u of paidUpfront) {
    await db.admin(`insert into payments (session_id, payer_id, payee_id, amount_pence, mode, status) values ($1, $2, $3, 700, 'upfront', 'authorised')`, [sid, u, ctx.host]);
  }
  const [f] = await db.admin(`select id from fixtures where session_id = $1`, [sid]);
  await db.rpc(ctx.host, 'save_lineup', { p_fixture: f.id, p_teams: { A: { players: [{ user_id: ctx.host }, { user_id: ctx.p }] }, B: { players: [{ user_id: ctx.q }] } } });
  await db.rpc(ctx.host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 1, p_score_b: 0 });
  await db.rpc(ctx.host, 'complete_session', { p_session: sid });
  return sid;
}

async function nextSession(ctx: { host: string; p: string; q: string; g: string }) {
  return db.rpc<string>(ctx.host, 'create_session', {
    p: { name: 'Next game', group_id: ctx.g, starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5, invitee_ids: [ctx.p, ctx.q], payment_mode: 'after', price_pence: 700 },
  });
}

describe('settle up before playing', () => {
  it('an unpaid bill blocks joining the next game until paid or marked cash', async () => {
    const ctx = await setup();
    const played = await playAndComplete(ctx, 'after');
    const next = await nextSession(ctx);
    await expectAppError(db.rpc(ctx.p, 'respond_to_session', { p_session: next, p_response: 'confirmed' }), 'unpaid_balance');
    // declining is still allowed
    expect(await db.rpc(ctx.p, 'respond_to_session', { p_session: next, p_response: 'declined' })).toBe('declined');
    const mine = await db.as(ctx.p, `select * from public.get_my_outstanding($1)`, [ctx.g]);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ session_id: played, amount_pence: 700, kind: 'session' });
    // host marks it paid in cash → can join
    await db.rpc(ctx.host, 'record_cash_payment', { p_session: played, p_user: ctx.p });
    expect(await db.rpc(ctx.p, 'respond_to_session', { p_session: next, p_response: 'confirmed' })).toBe('confirmed');
    // the other player pays by card → can join
    await db.admin(`update payments set status = 'paid' where session_id = $1 and payer_id = $2`, [played, ctx.q]);
    expect(await db.rpc(ctx.q, 'respond_to_session', { p_session: next, p_response: 'confirmed' })).toBe('confirmed');
  });

  it('the host can still add an owing player directly; groups can switch the rule off', async () => {
    const ctx = await setup();
    await playAndComplete(ctx, 'after');
    const next = await nextSession(ctx);
    await db.rpc(ctx.host, 'add_session_player', { p_session: next, p_user: ctx.p });
    expect((await db.admin(`select status from session_attendance where session_id = $1 and user_id = $2`, [next, ctx.p]))[0].status).toBe('confirmed');
    await db.as(ctx.host, `update group_settings set require_settled = false where group_id = $1`, [ctx.g]);
    expect(await db.rpc(ctx.q, 'respond_to_session', { p_session: next, p_response: 'confirmed' })).toBe('confirmed');
  });

  it('upfront: players who played without paying are billed at full time', async () => {
    const ctx = await setup();
    const sid = await playAndComplete(ctx, 'upfront', [ctx.q]); // q paid upfront, p didn't
    const bills = await db.admin(`select payer_id, status, mode from payments where session_id = $1 order by status`, [sid]);
    expect(bills).toEqual(expect.arrayContaining([
      { payer_id: ctx.q, status: 'authorised', mode: 'upfront' },
      { payer_id: ctx.p, status: 'unpaid', mode: 'after' },
    ]));
    expect(bills).toHaveLength(2); // host never billed
    const [n] = await db.admin(`select body from notifications where user_id = $1 and type = 'payment_required' and data->>'session_id' = $2`, [ctx.p, sid]);
    expect(n.body).toMatch(/played without paying/);
    const next = await nextSession(ctx);
    await expectAppError(db.rpc(ctx.p, 'respond_to_session', { p_session: next, p_response: 'confirmed' }), 'unpaid_balance');
    expect(await db.rpc(ctx.q, 'respond_to_session', { p_session: next, p_response: 'confirmed' })).toBe('confirmed');
  });

  it('sends a reminder after 24 hours and a last one after 3 days, once each', async () => {
    const ctx = await setup();
    const sid = await playAndComplete(ctx, 'after');
    await db.admin(`update payments set created_at = now() - interval '25 hours' where session_id = $1`, [sid]);
    await db.admin(`select public.process_session_deadlines()`);
    await db.admin(`select public.process_session_deadlines()`);
    const count = async () => (await db.admin(`select count(*)::int n from notifications where user_id = $1 and type = 'payment_reminder'`, [ctx.p]))[0].n;
    expect(await count()).toBe(1);
    await db.admin(`update payments set created_at = now() - interval '4 days' where session_id = $1`, [sid]);
    await db.admin(`select public.process_session_deadlines()`);
    await db.admin(`select public.process_session_deadlines()`);
    expect(await count()).toBe(2);
    const [last] = await db.admin(`select title from notifications where user_id = $1 and type = 'payment_reminder' order by created_at desc limit 1`, [ctx.p]);
    expect(last.title).toBe('Last reminder: payment due');
    // paid bills get no more reminders
    await db.admin(`update payments set status = 'paid' where session_id = $1`, [sid]);
    await db.admin(`update payments set created_at = now() - interval '10 days' where session_id = $1`, [sid]);
    await db.admin(`select public.process_session_deadlines()`);
    expect(await count()).toBe(2);
  });

  it('hosts and admins see balances; players do not', async () => {
    const ctx = await setup();
    await playAndComplete(ctx, 'after');
    const rows = await db.as(ctx.host, `select * from public.get_group_balances($1)`, [ctx.g]);
    expect(rows.find((r) => r.user_id === ctx.p).unpaid_pence).toBe(700);
    expect(rows.find((r) => r.user_id === ctx.host).unpaid_pence).toBe(0);
    await expectAppError(db.rpc(ctx.p, 'get_group_balances', { p_group: ctx.g }), 'forbidden');
  });
});
