// Creates a Stripe Checkout Session for a player's bill: session fee + any late fines,
// plus a booking fee that covers card processing so the host receives the full amount.
// Destination charge: funds settle to the host's connected account; the platform never holds them.
// Upfront mode uses manual capture (authorise now, capture once the host confirms the game happened).
// Checkout shows Apple Pay / Google Pay / cards automatically (enable them in the Stripe dashboard).
//
// Guests are on the bill of the player who brought them (one payment), or on a separate 'guest' bill
// if they were added after the player had paid.
//
// Body: { session_id, payment_id?, quote? }
//   quote: true → returns the itemised bill without creating anything.
//   payment_id   → pay a specific bill (e.g. a one-off late-fine request).
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { appUrl, stripeClient } from '../_shared/stripe.ts';
import { applicationFee, canPayUpfrontNow, paymentLines } from '../_shared/payments-core.ts';

const HOST_FEE_BPS = Number(Deno.env.get('PLATFORM_FEE_BPS') ?? '0');

Deno.serve(handler(async (req) => {
  const { user } = await requireUser(req);
  const body = (await req.json()) as { session_id: string; payment_id?: string; quote?: boolean };
  if (!body.session_id) throw new HttpError(400, 'invalid', 'Missing session.');
  const admin = adminClient();
  // booking fee settings live in the database (app_settings) so they can change without a redeploy
  const { data: fees } = await admin.from('app_settings').select('*').maybeSingle();
  const FEE_RATE_BPS = fees?.booking_fee_rate_bps ?? 150;
  const FEE_FIXED_PENCE = fees?.booking_fee_fixed_pence ?? 20;
  const FEE_MIN_PENCE = fees?.booking_fee_min_pence ?? 50;

  const { data: s } = await admin.from('sessions').select('*').eq('id', body.session_id).maybeSingle();
  if (!s) throw new HttpError(404, 'not_found', 'Session could not be found.');

  // ---------------------------------------------------------------- which bill?
  let payment: any = null;
  if (body.payment_id) {
    const { data } = await admin.from('payments').select('*').eq('id', body.payment_id).eq('payer_id', user.id).maybeSingle();
    if (!data) throw new HttpError(404, 'not_found', 'Payment not found.');
    payment = data;
  } else {
    if (s.payment_mode === 'free') throw new HttpError(400, 'invalid', 'This session is free.');
    if (s.status === 'cancelled') throw new HttpError(400, 'locked', 'This session was cancelled.');
    if (s.host_id === user.id) throw new HttpError(400, 'invalid', 'Hosts do not pay themselves.');
    const { data: attendance } = await admin.from('session_attendance').select('*').eq('session_id', s.id).eq('user_id', user.id).maybeSingle();
    const { data: existing } = await admin.from('payments').select('*').eq('session_id', s.id).eq('payer_id', user.id).eq('kind', 'session').maybeSingle();
    if (existing && ['unpaid', 'failed', 'pending', 'cancelled'].includes(existing.status)) {
      // an existing bill (pay-after request, or a bill for playing without paying upfront) can always be paid
    } else if (s.payment_mode === 'upfront') {
      if (attendance?.status !== 'confirmed') throw new HttpError(400, 'not_attending', 'Confirm your attendance before paying.');
      const window = canPayUpfrontNow(new Date(s.starts_at));
      if (!window.ok) throw new HttpError(400, 'window_not_open', `Upfront payment opens ${window.opensAt!.toUTCString()} (card holds last up to 7 days).`);
      if (s.status !== 'scheduled' && s.status !== 'in_progress') throw new HttpError(400, 'locked', 'Upfront payment is closed for this session.');
    } else if (!existing || attendance?.verification !== 'verified') {
      throw new HttpError(400, 'not_due', 'Payment is requested after the session has been completed.');
    }
    payment = existing;
  }
  if (payment && ['paid', 'authorised', 'partially_refunded', 'refunded', 'disputed'].includes(payment.status)) {
    return json({ already_paid: true, status: payment.status });
  }

  // ---------------------------------------------------------------- itemise
  const fineRows = async (paymentId: string | null) => {
    if (paymentId) {
      const { data } = await admin.from('late_fines').select('amount_pence, session:sessions(name)').eq('payment_id', paymentId);
      return data ?? [];
    }
    if (!s.group_id) return [];
    const { data } = await admin.from('late_fines').select('amount_pence, session:sessions(name)').eq('group_id', s.group_id).eq('user_id', user.id).eq('status', 'owed');
    return data ?? [];
  };
  let pendingGuests = 0;
  if (!payment && s.host_id !== user.id) {
    const { count } = await admin.from('session_guests').select('id', { count: 'exact', head: true }).eq('session_id', s.id).eq('added_by', user.id).eq('status', 'confirmed');
    pendingGuests = count ?? 0;
  }
  // Guests are paid for by the player who brings them (the host's own guests are free).
  // A stored bill knows how many guests it covers; before a bill exists, count the confirmed guests.
  const itemise = (p: any, finesTotal: number) => {
    if (!p) return { sessionPence: s.price_pence, guests: { count: pendingGuests, unitPence: s.price_pence } };
    if (p.kind === 'fine') return { sessionPence: 0, guests: undefined };
    if (p.kind === 'guest') return { sessionPence: 0, guests: { count: p.guest_count || 1, unitPence: Math.round(p.amount_pence / (p.guest_count || 1)) } };
    const guestPence = (p.guest_count ?? 0) * s.price_pence;
    return { sessionPence: p.amount_pence - finesTotal - guestPence, guests: { count: p.guest_count ?? 0, unitPence: s.price_pence } };
  };
  const fines = (await fineRows(payment?.id ?? null)).map((f: any) => ({ label: `Late fine (${f.session?.name ?? 'earlier session'})`, amount_pence: f.amount_pence }));
  const finesTotal = fines.reduce((a, f) => a + f.amount_pence, 0);
  const bill = paymentLines({ ...itemise(payment, finesTotal), fines, feeRateBps: FEE_RATE_BPS, feeFixedPence: FEE_FIXED_PENCE, feeMinPence: FEE_MIN_PENCE });

  if (body.quote) return json(bill);

  const payeeId = payment?.payee_id ?? s.host_id;
  const { data: account } = await admin.from('payment_accounts').select('*').eq('user_id', payeeId).maybeSingle();
  if (!account?.charges_enabled) {
    throw new HttpError(400, 'host_not_ready', 'The host has not finished setting up payouts yet. Let them know, or pay them directly.');
  }

  // ---------------------------------------------------------------- create / reuse the bill row
  if (!payment) {
    // inserting the bill attaches any owed late fines (database trigger)
    const { data: created, error } = await admin.from('payments').insert({
      session_id: s.id, payer_id: user.id, payee_id: s.host_id, amount_pence: s.price_pence, mode: s.payment_mode,
      status: 'pending', method: 'card', kind: 'session',
    }).select().single();
    if (error) throw error;
    const { data: fresh } = await admin.from('payments').select('*').eq('id', created.id).single();
    payment = fresh;
  } else {
    // after kick-off there is nothing to hold: charge immediately
    const afterGame = !['scheduled', 'in_progress'].includes(s.status);
    if (afterGame && payment.mode === 'upfront') payment.mode = 'after';
    await admin.from('payments').update({ status: 'pending', failure_reason: null, method: 'card', mode: payment.mode }).eq('id', payment.id);
  }
  // re-itemise from the stored bill so Stripe charges exactly what the database holds
  const storedFines = (await fineRows(payment.id)).map((f: any) => ({ label: `Late fine (${f.session?.name ?? 'earlier session'})`, amount_pence: f.amount_pence }));
  const storedFinesTotal = storedFines.reduce((a, f) => a + f.amount_pence, 0);
  const final = paymentLines({
    ...itemise(payment, storedFinesTotal),
    fines: storedFines, feeRateBps: FEE_RATE_BPS, feeFixedPence: FEE_FIXED_PENCE, feeMinPence: FEE_MIN_PENCE,
  });
  if (final.host_receives_pence !== payment.amount_pence) throw new HttpError(409, 'bill_changed', 'Your bill changed. Please try again.');

  const platformFee = final.booking_fee_pence + applicationFee(payment.amount_pence, HOST_FEE_BPS);
  await admin.from('payments').update({ application_fee_pence: platformFee }).eq('id', payment.id);

  const stripe = stripeClient();
  // Reopening checkout: send the player back to their open Stripe page if the amount is the same;
  // if the bill changed (e.g. a fine was waived), close the old page first so it can't be paid.
  if (payment.stripe_checkout_session_id) {
    try {
      const prev = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id);
      if (prev.status === 'complete') return json({ already_paid: true, status: payment.status });
      if (prev.status === 'open') {
        if (prev.amount_total === final.total_pence && prev.url) return json({ url: prev.url, payment_id: payment.id, ...final });
        await stripe.checkout.sessions.expire(prev.id);
      }
    } catch (e) {
      console.warn('Could not reuse previous checkout session', e);
    }
  }
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      customer_email: user.email,
      line_items: final.lines.map((l) => ({
        quantity: 1,
        price_data: {
          currency: s.currency,
          unit_amount: l.amount_pence,
          product_data: { name: l.kind === 'session' ? `${s.name} — match fee` : l.kind === 'guest' ? `${s.name} — ${l.label.toLowerCase()}` : l.label },
        },
      })),
      payment_intent_data: {
        capture_method: payment.mode === 'upfront' ? 'manual' : 'automatic',
        application_fee_amount: platformFee || undefined,
        transfer_data: { destination: account.stripe_account_id },
        metadata: { payment_id: payment.id, session_id: s.id, payer_id: user.id, kind: payment.kind },
      },
      metadata: { payment_id: payment.id, session_id: s.id },
      success_url: appUrl(`done?kind=paid&session=${s.id}`),
      cancel_url: appUrl(`done?kind=cancelled&session=${s.id}`),
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    },
    // unique per attempt: protects against network retries of this exact request only
    { idempotencyKey: `checkout-${payment.id}-${crypto.randomUUID()}` },
  );
  await admin.from('payments').update({ stripe_checkout_session_id: checkout.id }).eq('id', payment.id);
  return json({ url: checkout.url, payment_id: payment.id, ...final });
}));
