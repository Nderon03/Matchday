/**
 * Payment rehearsal: runs the REAL Edge Functions (checkout, Stripe webhook, host actions, cron) in
 * Deno against the local test database, with Stripe replaced by a fake that records every request.
 * Checks what players are charged, what the host receives, and that every Stripe event moves the
 * bill to the right state, including retries, replays, out-of-order events and forged signatures.
 *
 * Run: ./scripts/test-payments-e2e.sh   (resets the local test database first)
 */
import { assert, assertEquals, assertObjectMatch } from 'jsr:@std/assert@1';
import { faults, handle, jwtFor, pool } from './gateway.ts';
import { event, FakeStripe, sign } from './fake-stripe.ts';

// ---------------------------------------------------------------- wiring
const WEBHOOK_SECRET = 'whsec_rehearsal';
const stripe = new FakeStripe();
const gateway = Deno.serve({ port: 0, onListen() {} }, handle);
Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${gateway.addr.port}`);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', jwtFor({ role: 'service_role' }));
Deno.env.set('SUPABASE_ANON_KEY', jwtFor({ role: 'anon' }));
Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_rehearsal');
Deno.env.set('STRIPE_WEBHOOK_SECRET', `whsec_other_destination,${WEBHOOK_SECRET}`);
Deno.env.set('APP_URL', 'https://matchdayapp.org');
Deno.env.set('CRON_SECRET', 'cron-rehearsal');

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'api.stripe.com') {
    const body = init?.body ? String(init.body) : url.search.slice(1);
    return stripe.handle(init?.method ?? 'GET', url.pathname, body);
  }
  return realFetch(input, init);
};

// each function calls Deno.serve(handler) when loaded: keep the handler instead of starting a server
type Fn = (req: Request) => Promise<Response>;
const fns: Record<string, Fn> = {};
let loading = '';
Object.defineProperty(Deno, 'serve', { value: (h: Fn) => { fns[loading] = h; return { finished: Promise.resolve(), shutdown: async () => {}, addr: { port: 0 } }; }, configurable: true, writable: true });
for (const name of ['payments-checkout', 'stripe-webhook', 'payments-host-action', 'payments-cron']) {
  loading = name;
  await import(`../../supabase/functions/${name}/index.ts`);
}

// ---------------------------------------------------------------- helpers
const sql = async <T = any>(q: string, params: unknown[] = []) => (await pool.query(q, params)).rows as T[];
const users = new Map<string, string>();
async function createUser(name: string) {
  const id = crypto.randomUUID();
  const email = `${name}-${id.slice(0, 6)}@example.com`;
  await sql(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())`,
    [id, email, JSON.stringify({ username: `${name}${id.slice(0, 6)}`, display_name: name })]);
  users.set(id, jwtFor({ sub: id, email, role: 'authenticated' }));
  return id;
}
async function rpcAs<T = any>(user: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
    const keys = Object.keys(args);
    const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
      keys.map((k) => (typeof args[k] === 'object' && args[k] !== null && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : args[k])));
    await c.query('commit');
    return r.rows[0]?.r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}
async function call(fn: string, user: string | null, body: unknown, headers: Record<string, string> = {}) {
  const res = await fns[fn](new Request(`http://functions/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${users.get(user)}` } : {}), ...headers },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json().catch(() => null) };
}
/** Deliver a Stripe event to the webhook, signed like Stripe signs it. A crash counts as a 500 (Stripe retries). */
async function deliver(evt: unknown, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(evt);
  try {
    const res = await fns['stripe-webhook'](new Request('http://functions/stripe-webhook', {
      method: 'POST', headers: { 'stripe-signature': await sign(payload, secret) }, body: payload,
    }));
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: 500, body: null };
  }
}
const payment = async (id: string) => (await sql(`select * from payments where id = $1`, [id]))[0];

/** A host who can take card payments, a player, and a paid game kicking off soon. */
async function paidGame(mode: 'upfront' | 'after', opts: { players?: number; price?: number; hostReady?: boolean; group?: boolean } = {}) {
  const host = await createUser('Host');
  const players: string[] = [];
  for (let i = 0; i < (opts.players ?? 1); i++) players.push(await createUser(`Player${i}`));
  const account = `acct_${crypto.randomUUID().slice(0, 8)}`;
  await sql(`insert into payment_accounts (user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted) values ($1, $2, $3, true, true)`,
    [host, account, opts.hostReady ?? true]);
  for (const p of players) {
    await rpcAs(host, 'send_friend_request', { p_target: p });
    const [req] = await sql(`select id from friend_requests where sender_id = $1 and receiver_id = $2 and status = 'pending'`, [host, p]);
    await rpcAs(p, 'respond_friend_request', { p_request: req.id, p_accept: true });
  }
  let groupId: string | null = null;
  if (opts.group) {
    groupId = await rpcAs<string>(host, 'create_group', { p_name: 'Rehearsal Group', p_visibility: 'private', p_join_policy: 'request' });
    await rpcAs(host, 'add_group_members', { p_group: groupId, p_users: players });
    for (const p of players) await rpcAs(p, 'respond_group_invite', { p_group: groupId, p_accept: true });
    await sql(`update group_settings set require_settled = false where group_id = $1`, [groupId]);
  }
  const sessionId = await rpcAs<string>(host, 'create_session', {
    p: { name: 'Rehearsal FC', group_id: groupId, starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, payment_mode: mode, price_pence: opts.price ?? 600,
      invitee_ids: players, postcode: 'NW7 2EU', latitude: 51.6142, longitude: -0.2447 },
  });
  for (const p of players) await rpcAs(p, 'respond_to_session', { p_session: sessionId, p_response: 'confirmed' });
  return { host, players, player: players[0], sessionId, account, groupId };
}
/** Kick-off has happened and the host has marked who turned up. */
async function played(sessionId: string, absent: string[] = []) {
  await sql(`update sessions set starts_at = now() - interval '2 hours', status = 'completed' where id = $1`, [sessionId]);
  await sql(`update session_attendance set verification = (case when user_id = any($2::uuid[]) then 'absent' else 'verified' end)::verification_status where session_id = $1 and status = 'confirmed'`, [sessionId, absent]);
}
/** The player pays on Stripe's page; Stripe sends the events it sends for that kind of payment. */
async function pay(player: string, sessionId: string) {
  const r = await call('payments-checkout', player, { session_id: sessionId });
  assertEquals(r.status, 200, JSON.stringify(r.body));
  const csId = (await payment(r.body.payment_id)).stripe_checkout_session_id;
  const { session, intent } = stripe.completeCheckout(csId);
  assertEquals((await deliver(event('checkout.session.completed', { ...session, created: Math.floor(Date.now() / 1000) }))).status, 200);
  if (intent.status === 'requires_capture') assertEquals((await deliver(event('payment_intent.amount_capturable_updated', intent))).status, 200);
  else assertEquals((await deliver(event('payment_intent.succeeded', intent))).status, 200);
  return { paymentId: r.body.payment_id as string, intent, checkout: r.body };
}

const opts = { sanitizeOps: false, sanitizeResources: false };

// ---------------------------------------------------------------- scenarios
Deno.test('upfront: quote, card hold, capture after the game, payout and refunds', opts, async (t) => {
  const g = await paidGame('upfront');
  let paymentId = '';
  let intentId = '';

  await t.step('the quote adds the booking fee on top of the host’s price', async () => {
    const q = await call('payments-checkout', g.player, { session_id: g.sessionId, quote: true });
    assertEquals(q.status, 200);
    assertObjectMatch(q.body, { host_receives_pence: 600, booking_fee_pence: 60, total_pence: 660 });
    assertEquals(stripe.calls.length, 0, 'a quote never touches Stripe');
  });

  await t.step('checkout asks Stripe to hold £6.60, keep the 60p fee, and send £6 to the host', async () => {
    stripe.reset();
    const r = await call('payments-checkout', g.player, { session_id: g.sessionId });
    assertEquals(r.status, 200, JSON.stringify(r.body));
    paymentId = r.body.payment_id;
    const [create] = stripe.callsTo(/^\/v1\/checkout\/sessions$/);
    assertEquals(create.params.mode, 'payment');
    assertEquals(create.params['line_items[0][price_data][unit_amount]'], '600');
    assertEquals(create.params['line_items[0][price_data][currency]'], 'gbp');
    assertEquals(create.params['line_items[1][price_data][unit_amount]'], '60');
    assertEquals(create.params['payment_intent_data[capture_method]'], 'manual');
    assertEquals(create.params['payment_intent_data[application_fee_amount]'], '60');
    assertEquals(create.params['payment_intent_data[transfer_data][destination]'], g.account);
    assertEquals(create.params['payment_intent_data[metadata][payment_id]'], paymentId);
    assertEquals(create.params['success_url'], `https://matchdayapp.org/done?kind=paid&session=${g.sessionId}`);
    const p = await payment(paymentId);
    assertObjectMatch(p, { status: 'pending', amount_pence: 600, application_fee_pence: 60, payee_id: g.host, mode: 'upfront' });
  });

  await t.step('opening checkout again reuses the same Stripe page', async () => {
    stripe.reset();
    const r = await call('payments-checkout', g.player, { session_id: g.sessionId });
    assertEquals(r.body.url, (await stripe.sessions.get((await payment(paymentId)).stripe_checkout_session_id)).url);
    assertEquals(stripe.callsTo(/^\/v1\/checkout\/sessions$/).length, 0, 'no second page');
  });

  await t.step('a forged or unsigned event changes nothing', async () => {
    const evt = event('payment_intent.succeeded', { id: 'pi_forged', metadata: { payment_id: paymentId } });
    assertEquals((await deliver(evt, 'whsec_attacker')).status, 400);
    const res = await fns['stripe-webhook'](new Request('http://f', { method: 'POST', body: JSON.stringify(evt) }));
    assertEquals(res.status, 400);
    assertEquals((await payment(paymentId)).status, 'pending');
  });

  await t.step('paying on Stripe puts a hold on the card (authorised, not charged)', async () => {
    const csId = (await payment(paymentId)).stripe_checkout_session_id;
    const { session, intent } = stripe.completeCheckout(csId);
    intentId = intent.id;
    assertEquals((await deliver(event('checkout.session.completed', session))).status, 200);
    assertObjectMatch(await payment(paymentId), { status: 'pending', stripe_payment_intent_id: intentId });
    const held = event('payment_intent.amount_capturable_updated', intent);
    assertEquals((await deliver(held)).status, 200);
    assertEquals((await payment(paymentId)).status, 'authorised');
    // Stripe re-sends events: a replay is recognised and ignored
    assertEquals((await deliver(held)).body, { received: true, duplicate: true });
    const again = await call('payments-checkout', g.player, { session_id: g.sessionId });
    assertEquals(again.body, { already_paid: true, status: 'authorised' });
  });

  await t.step('the host can’t confirm before kick-off; another player can’t confirm at all', async () => {
    assertEquals((await call('payments-host-action', g.host, { session_id: g.sessionId, action: 'confirm' })).status, 400);
    assertEquals((await call('payments-host-action', g.player, { session_id: g.sessionId, action: 'confirm' })).status, 403);
    assertEquals((await call('payments-host-action', null, { session_id: g.sessionId, action: 'confirm' })).status, 401);
  });

  await t.step('after the game the host confirms: the hold is captured, then the bill is paid', async () => {
    await played(g.sessionId);
    stripe.reset();
    const r = await call('payments-host-action', g.host, { session_id: g.sessionId, action: 'confirm' });
    assertEquals(r.body, { captured: 1, released: 0, requested: 0, failed: 0 });
    assertEquals(stripe.calls.map((c) => c.path), [`/v1/payment_intents/${intentId}/capture`]);
    assertEquals((await payment(paymentId)).status, 'authorised', 'only the verified webhook marks it paid');
    assertEquals((await deliver(event('payment_intent.succeeded', stripe.intents.get(intentId)))).status, 200);
    assertObjectMatch(await payment(paymentId), { status: 'paid', receipt_url: 'https://pay.stripe.test/receipt' });
  });

  await t.step('the payout record shows what the host actually receives (£6, not £6 minus the booking fee)', async () => {
    const rows = await sql(`select * from payout_records where payment_id = $1`, [paymentId]);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].amount_pence, 600);
    assertEquals(rows[0].host_id, g.host);
  });

  await t.step('a late, out-of-order event never moves a paid bill backwards', async () => {
    await deliver(event('payment_intent.amount_capturable_updated', stripe.intents.get(intentId)));
    await deliver(event('checkout.session.completed', { ...stripe.sessions.get((await payment(paymentId)).stripe_checkout_session_id), payment_status: 'unpaid' }));
    assertEquals((await payment(paymentId)).status, 'paid');
  });

  await t.step('the host refunds £2, then the rest; Stripe also takes back the transfer and fee', async () => {
    stripe.reset();
    const part = await call('payments-host-action', g.host, { session_id: g.sessionId, action: 'refund', payment_id: paymentId, amount_pence: 200, reason: 'Left early' });
    assertEquals(part.status, 200);
    const [refund] = stripe.callsTo(/^\/v1\/refunds$/);
    assertObjectMatch(refund.params, { payment_intent: intentId, amount: '200', reverse_transfer: 'true', refund_application_fee: 'true' });
    await deliver(event('charge.refunded', { payment_intent: intentId, amount: 660, amount_refunded: 200, refunds: { data: [{ id: part.body.refund_id, amount: 200, status: 'succeeded' }] } }));
    assertEquals((await payment(paymentId)).status, 'partially_refunded');
    await deliver(event('charge.refunded', { payment_intent: intentId, amount: 660, amount_refunded: 660, refunds: { data: [{ id: 're_rest', amount: 460, status: 'succeeded' }] } }));
    assertEquals((await payment(paymentId)).status, 'refunded');
    const refunds = await sql(`select stripe_refund_id, amount_pence from refunds where payment_id = $1 order by amount_pence`, [paymentId]);
    assertEquals(refunds.map((r) => r.amount_pence), [200, 460]);
  });
});

Deno.test('upfront: a no-show’s hold is released, never charged', opts, async () => {
  const g = await paidGame('upfront', { players: 2 });
  const [shows, noShow] = g.players;
  const a = await pay(shows, g.sessionId);
  const b = await pay(noShow, g.sessionId);
  await played(g.sessionId, [noShow]);
  stripe.reset();
  const r = await call('payments-host-action', g.host, { session_id: g.sessionId, action: 'confirm' });
  assertEquals(r.body, { captured: 1, released: 1, requested: 0, failed: 0 });
  assertEquals(stripe.calls.map((c) => c.path).sort(), [`/v1/payment_intents/${a.intent.id}/capture`, `/v1/payment_intents/${b.intent.id}/cancel`].sort());
  await deliver(event('payment_intent.canceled', stripe.intents.get(b.intent.id)));
  assertEquals((await payment(b.paymentId)).status, 'cancelled');
  assertEquals((await sql(`select count(*)::int as n from payout_records where payment_id = $1`, [b.paymentId]))[0].n, 0);
});

Deno.test('a webhook that fails halfway is finished when Stripe retries it', opts, async () => {
  const g = await paidGame('upfront');
  const r = await call('payments-checkout', g.player, { session_id: g.sessionId });
  const { session, intent } = stripe.completeCheckout((await payment(r.body.payment_id)).stripe_checkout_session_id);
  await deliver(event('checkout.session.completed', session));
  const held = event('payment_intent.amount_capturable_updated', intent);
  faults.failNextWrite = 'payments';
  assertEquals((await deliver(held)).status, 500, 'the error goes back to Stripe so it retries');
  assertEquals((await payment(r.body.payment_id)).status, 'pending');
  const retry = await deliver(held);
  assertEquals(retry.status, 200);
  assert(!retry.body?.duplicate, 'the unfinished event is processed, not skipped');
  assertEquals((await payment(r.body.payment_id)).status, 'authorised');
});

Deno.test('an abandoned checkout page expires back to unpaid; an old page expiring is ignored', opts, async () => {
  const g = await paidGame('upfront');
  const r = await call('payments-checkout', g.player, { session_id: g.sessionId });
  const first = (await payment(r.body.payment_id)).stripe_checkout_session_id;
  await deliver(event('checkout.session.expired', stripe.sessions.get(first)));
  assertObjectMatch(await payment(r.body.payment_id), { status: 'unpaid', stripe_checkout_session_id: null });
  // they try again: a new page; then Stripe tells us (late) that the first one expired
  const again = await call('payments-checkout', g.player, { session_id: g.sessionId });
  assertEquals(again.status, 200);
  const second = (await payment(r.body.payment_id)).stripe_checkout_session_id;
  assert(second && second !== first);
  await deliver(event('checkout.session.expired', { ...stripe.sessions.get(first), id: first }));
  assertObjectMatch(await payment(r.body.payment_id), { status: 'pending', stripe_checkout_session_id: second });
});

Deno.test('a host who hasn’t finished Stripe setup can’t take card payments until Stripe says so', opts, async () => {
  const g = await paidGame('upfront', { hostReady: false });
  const r = await call('payments-checkout', g.player, { session_id: g.sessionId });
  assertEquals(r.status, 400);
  assertEquals(r.body.error.code, 'host_not_ready');
  await deliver(event('account.updated', { id: g.account, charges_enabled: true, payouts_enabled: true, details_submitted: true }));
  assertEquals((await call('payments-checkout', g.player, { session_id: g.sessionId })).status, 200);
});

Deno.test('the host and outsiders can’t pay for this game; nobody can pay before saying they’re in', opts, async () => {
  const g = await paidGame('upfront');
  assertEquals((await call('payments-checkout', g.host, { session_id: g.sessionId })).body.error.code, 'invalid');
  const outsider = await createUser('Outsider');
  assertEquals((await call('payments-checkout', outsider, { session_id: g.sessionId })).body.error.code, 'not_attending');
  assertEquals((await call('payments-checkout', null, { session_id: g.sessionId })).status, 401);
});

Deno.test('pay after the game: charged straight away, paid on the webhook', opts, async () => {
  const g = await paidGame('after', { players: 2 });
  assertEquals((await call('payments-checkout', g.player, { session_id: g.sessionId })).body.error.code, 'not_due', 'nothing to pay before the game');
  // kick-off has passed and the player turned up; the host completes the game
  await sql(`update sessions set starts_at = now() - interval '2 hours' where id = $1`, [g.sessionId]);
  await sql(`update session_attendance set verification = 'verified' where session_id = $1 and user_id = $2`, [g.sessionId, g.player]);
  for (const f of await sql(`select id from fixtures where session_id = $1`, [g.sessionId])) {
    await rpcAs(g.host, 'save_lineup', { p_fixture: f.id, p_teams: { A: { players: [{ user_id: g.players[0] }] }, B: { players: [{ user_id: g.players[1] }] } } });
    await rpcAs(g.host, 'record_fixture_score', { p_fixture: f.id, p_score_a: 2, p_score_b: 1 });
  }
  await rpcAs(g.host, 'complete_session', { p_session: g.sessionId });
  const bill = (await sql(`select * from payments where session_id = $1 and payer_id = $2`, [g.sessionId, g.player]))[0];
  assert(bill, 'finishing the game creates the bill');
  assertEquals(bill.status, 'unpaid');
  stripe.reset();
  const { paymentId } = await pay(g.player, g.sessionId);
  assertEquals(paymentId, bill.id);
  assertEquals(stripe.callsTo(/^\/v1\/checkout\/sessions$/)[0].params['payment_intent_data[capture_method]'], 'automatic');
  assertObjectMatch(await payment(paymentId), { status: 'paid' });
  assertEquals((await sql(`select amount_pence from payout_records where payment_id = $1`, [paymentId]))[0].amount_pence, 600);
});

Deno.test('guests: the player pays for the mates they bring, at the game price, in one payment', opts, async () => {
  const g = await paidGame('upfront');
  await rpcAs(g.player, 'add_session_guest', { p_session: g.sessionId, p_name: 'Dave' });
  await rpcAs(g.player, 'add_session_guest', { p_session: g.sessionId, p_name: 'Sam' });
  const q = await call('payments-checkout', g.player, { session_id: g.sessionId, quote: true });
  assertObjectMatch(q.body, { host_receives_pence: 1800, booking_fee_pence: 60, total_pence: 1860 });
  stripe.reset();
  const r = await call('payments-checkout', g.player, { session_id: g.sessionId });
  assertEquals(r.status, 200, JSON.stringify(r.body));
  const [create] = stripe.callsTo(/^\/v1\/checkout\/sessions$/);
  const amounts = Object.keys(create.params).filter((k) => k.endsWith('[unit_amount]')).sort().map((k) => Number(create.params[k]));
  assertEquals(amounts, [600, 1200, 60]);
  assertEquals(create.params['payment_intent_data[application_fee_amount]'], '60');
  assertObjectMatch(await payment(r.body.payment_id), { amount_pence: 1800, guest_count: 2 });
});

Deno.test('late fines: an owed fine goes on the next bill, the host gets it, and it’s marked paid', opts, async () => {
  const g = await paidGame('upfront', { group: true });
  // the player turned up late to an earlier game in this group and owes £2
  const earlier = await rpcAs<string>(g.host, 'create_session', { p: { name: 'Last week', group_id: g.groupId, starts_at: new Date(Date.now() + 1800_000).toISOString(),
    format_size: 5, postcode: 'NW7 2EU', latitude: 51.6142, longitude: -0.2447 } });
  await sql(`insert into late_fines (group_id, session_id, user_id, level, original_pence, amount_pence) values ($1, $2, $3, 1, 200, 200)`, [g.groupId, earlier, g.player]);
  const q = await call('payments-checkout', g.player, { session_id: g.sessionId, quote: true });
  assertObjectMatch(q.body, { host_receives_pence: 800, total_pence: 800 + q.body.booking_fee_pence });
  stripe.reset();
  const { paymentId } = await pay(g.player, g.sessionId);
  const [create] = stripe.callsTo(/^\/v1\/checkout\/sessions$/);
  const amounts = Object.keys(create.params).filter((k) => k.endsWith('[unit_amount]')).sort().map((k) => Number(create.params[k]));
  assertEquals(amounts.slice(0, 2), [600, 200]);
  assertObjectMatch(await payment(paymentId), { amount_pence: 800, status: 'authorised' });
  await played(g.sessionId);
  await call('payments-host-action', g.host, { session_id: g.sessionId, action: 'confirm' });
  const p = await payment(paymentId);
  await deliver(event('payment_intent.succeeded', stripe.intents.get(p.stripe_payment_intent_id)));
  assertEquals((await sql(`select status from late_fines where user_id = $1`, [g.player]))[0].status, 'paid');
  assertEquals((await sql(`select amount_pence from payout_records where payment_id = $1`, [paymentId]))[0].amount_pence, 800);
});

Deno.test('cron: a cancelled game releases holds and refunds card payments; only with the cron secret', opts, async () => {
  const g = await paidGame('upfront', { players: 2 });
  const held = await pay(g.players[0], g.sessionId);
  const charged = await pay(g.players[1], g.sessionId);
  // pretend the second was already captured
  await sql(`update payments set status = 'paid' where id = $1`, [charged.paymentId]);
  await sql(`update sessions set status = 'cancelled' where id = $1`, [g.sessionId]);
  assertEquals((await call('payments-cron', null, {}, {})).status, 401);
  stripe.reset();
  const r = await call('payments-cron', null, {}, { 'x-cron-secret': 'cron-rehearsal' });
  assertEquals(r.status, 200);
  assert(r.body.released >= 1 && r.body.refunded >= 1, JSON.stringify(r.body));
  assert(stripe.calls.some((c) => c.path === `/v1/payment_intents/${held.intent.id}/cancel`));
  assert(stripe.calls.some((c) => c.path === '/v1/refunds' && c.params.payment_intent === charged.intent.id && c.params.reverse_transfer === 'true'));
});

Deno.test({ name: 'close', ...opts, fn: async () => { await pool.end(); await gateway.shutdown(); } });
