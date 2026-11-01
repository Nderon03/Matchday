// Stripe webhook receiver. The ONLY place payment status changes to paid/authorised/refunded.
// Signatures are verified server-side; events are stored once (idempotent by Stripe event id).
import { adminClient, json } from '../_shared/http.ts';
import { accountFlagsFromEvent, patchFromEvent, shouldTransition, verifyStripeSignature, type StripeEventLike, type PaymentStatus } from '../_shared/payments-core.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const payload = await req.text();
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const verified = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret);
  if (!verified.ok) return json({ error: verified.reason }, 400);

  const event = JSON.parse(payload) as StripeEventLike;
  const admin = adminClient();

  const { error: dupErr } = await admin.from('payment_events').insert({ stripe_event_id: event.id, type: event.type, payload: event });
  if (dupErr) {
    if (dupErr.code === '23505') return json({ received: true, duplicate: true });
    throw dupErr;
  }

  const flags = accountFlagsFromEvent(event);
  if (flags) {
    await admin.from('payment_accounts').update(flags).eq('stripe_account_id', flags.stripe_account_id);
  }

  const patch = patchFromEvent(event);
  let paymentId: string | null = null;
  if (patch) {
    let q = admin.from('payments').select('*');
    if (patch.lookup.paymentId) q = q.eq('id', patch.lookup.paymentId);
    else if (patch.lookup.checkoutSessionId) q = q.eq('stripe_checkout_session_id', patch.lookup.checkoutSessionId);
    else if (patch.lookup.paymentIntentId) q = q.eq('stripe_payment_intent_id', patch.lookup.paymentIntentId);
    const { data: payment } = await q.maybeSingle();
    if (payment) {
      paymentId = payment.id;
      const update: Record<string, unknown> = { ...(patch.fields ?? {}) };
      if (patch.status && shouldTransition(payment.status as PaymentStatus, patch.status)) update.status = patch.status;
      if (Object.keys(update).length) await admin.from('payments').update(update).eq('id', payment.id);
      if (patch.refund) {
        await admin.from('refunds').upsert(
          { payment_id: payment.id, stripe_refund_id: patch.refund.stripeRefundId, amount_pence: patch.refund.amountPence, status: patch.refund.status },
          { onConflict: 'stripe_refund_id' },
        );
      }
      if (update.status === 'paid' && payment.payee_id) {
        await admin.from('payout_records').insert({ payment_id: payment.id, host_id: payment.payee_id, amount_pence: payment.amount_pence - (payment.application_fee_pence ?? 0), stripe_reference: patch.lookup.paymentIntentId ?? null });
      }
    }
  }
  await admin.from('payment_events').update({ processed_at: new Date().toISOString(), payment_id: paymentId }).eq('stripe_event_id', event.id);
  return json({ received: true });
});
