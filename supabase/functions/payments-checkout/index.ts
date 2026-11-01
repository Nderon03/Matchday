// Creates a Stripe Checkout Session for a player's session fee.
// Destination charge: funds settle to the host's connected account; the platform never holds them.
// Upfront mode uses manual capture (authorise now, capture once the host confirms the game happened).
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { appUrl, stripeClient } from '../_shared/stripe.ts';
import { applicationFee, canPayUpfrontNow } from '../_shared/payments-core.ts';

Deno.serve(handler(async (req) => {
  const { user } = await requireUser(req);
  const { session_id } = (await req.json()) as { session_id: string };
  if (!session_id) throw new HttpError(400, 'invalid', 'Missing session.');
  const admin = adminClient();

  const { data: s } = await admin.from('sessions').select('*').eq('id', session_id).maybeSingle();
  if (!s) throw new HttpError(404, 'not_found', 'Session could not be found.');
  if (s.payment_mode === 'free') throw new HttpError(400, 'invalid', 'This session is free.');
  if (s.status === 'cancelled') throw new HttpError(400, 'locked', 'This session was cancelled.');
  if (s.host_id === user.id) throw new HttpError(400, 'invalid', 'Hosts do not pay themselves.');

  const { data: attendance } = await admin.from('session_attendance').select('*').eq('session_id', session_id).eq('user_id', user.id).maybeSingle();
  const { data: existing } = await admin.from('payments').select('*').eq('session_id', session_id).eq('payer_id', user.id).maybeSingle();

  if (s.payment_mode === 'upfront') {
    if (attendance?.status !== 'confirmed') throw new HttpError(400, 'not_attending', 'Confirm your attendance before paying.');
    const window = canPayUpfrontNow(new Date(s.starts_at));
    if (!window.ok) {
      throw new HttpError(400, 'window_not_open', `Upfront payment opens ${window.opensAt!.toUTCString()} (card holds last up to 7 days).`);
    }
    if (s.status !== 'scheduled' && s.status !== 'in_progress') throw new HttpError(400, 'locked', 'Upfront payment is closed for this session.');
  } else if (!existing || attendance?.verification !== 'verified') {
    throw new HttpError(400, 'not_due', 'Payment is requested after the session has been completed.');
  }
  if (existing && ['paid', 'authorised', 'partially_refunded', 'refunded', 'disputed'].includes(existing.status)) {
    return json({ already_paid: true, status: existing.status });
  }

  const { data: account } = await admin.from('payment_accounts').select('*').eq('user_id', s.host_id).maybeSingle();
  if (!account?.charges_enabled) {
    throw new HttpError(400, 'host_not_ready', 'The host has not finished setting up payouts yet. Let them know, or pay them directly.');
  }

  const fee = applicationFee(s.price_pence, Number(Deno.env.get('PLATFORM_FEE_BPS') ?? '0'));
  const { data: payment, error } = await admin
    .from('payments')
    .upsert(
      {
        id: existing?.id,
        session_id,
        payer_id: user.id,
        payee_id: s.host_id,
        amount_pence: s.price_pence,
        application_fee_pence: fee,
        mode: s.payment_mode,
        status: 'pending',
        method: 'card',
        failure_reason: null,
      },
      { onConflict: 'session_id,payer_id' },
    )
    .select()
    .single();
  if (error) throw error;

  const stripe = stripeClient();
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: s.currency,
          unit_amount: s.price_pence,
          product_data: { name: `${s.name} — match fee`, description: new Date(s.starts_at).toUTCString() },
        },
      }],
      payment_intent_data: {
        capture_method: s.payment_mode === 'upfront' ? 'manual' : 'automatic',
        application_fee_amount: fee || undefined,
        transfer_data: { destination: account.stripe_account_id },
        metadata: { payment_id: payment.id, session_id, payer_id: user.id },
      },
      metadata: { payment_id: payment.id, session_id },
      success_url: appUrl(`session/${session_id}/payments?checkout=success`),
      cancel_url: appUrl(`session/${session_id}/payments?checkout=cancelled`),
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    },
    { idempotencyKey: `checkout-${payment.id}-${Date.now() >> 16}` },
  );
  await admin.from('payments').update({ stripe_checkout_session_id: checkout.id }).eq('id', payment.id);
  return json({ url: checkout.url, payment_id: payment.id });
}));
