// Host actions: confirm the session took place (captures upfront authorisations,
// releases holds for absent players) or refund a player's card payment.
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { stripeClient } from '../_shared/stripe.ts';

Deno.serve(handler(async (req) => {
  const { client, user } = await requireUser(req);
  const body = (await req.json()) as { session_id: string; action: 'confirm' | 'refund'; payment_id?: string; amount_pence?: number; reason?: string };
  const admin = adminClient();
  const stripe = stripeClient();

  // permission check runs as the user: raises unless they manage this session
  const { data: isManager, error: permErr } = await client.rpc('is_session_manager', { p_session: body.session_id });
  if (permErr || !isManager) throw new HttpError(403, 'forbidden', 'Only the host can do that.');

  if (body.action === 'confirm') {
    const { error } = await client.rpc('mark_host_confirmed', { p_session: body.session_id });
    if (error) throw error;
    const { data: payments } = await admin.from('payments').select('*').eq('session_id', body.session_id).in('status', ['authorised', 'cancelled']);
    const { data: att } = await admin.from('session_attendance').select('user_id, verification').eq('session_id', body.session_id);
    const absent = new Set((att ?? []).filter((a) => a.verification === 'absent').map((a) => a.user_id));
    const results = { captured: 0, released: 0, requested: 0, failed: 0 };
    for (const p of payments ?? []) {
      try {
        if (p.status === 'authorised') {
          if (absent.has(p.payer_id)) {
            await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
            results.released++;
          } else {
            await stripe.paymentIntents.capture(p.stripe_payment_intent_id);
            results.captured++;
          }
        } else if (p.status === 'cancelled' && p.mode === 'upfront' && !absent.has(p.payer_id)) {
          // hold lapsed (e.g. host confirmed late): convert into a pay-after request
          await admin.from('payments').update({ mode: 'after', status: 'unpaid', stripe_checkout_session_id: null, stripe_payment_intent_id: null }).eq('id', p.id);
          await admin.rpc('notify', {
            p_user: p.payer_id, p_type: 'payment_required', p_title: 'Payment due',
            p_body: 'Your card hold expired before the host confirmed. Tap to pay your share.', p_data: { session_id: body.session_id },
          });
          results.requested++;
        }
      } catch (e) {
        console.error('capture failed', p.id, e);
        results.failed++;
      }
    }
    // statuses are updated by the verified webhook (payment_intent.succeeded / canceled)
    return json(results);
  }

  if (body.action === 'refund') {
    const { data: p } = await admin.from('payments').select('*').eq('id', body.payment_id).eq('session_id', body.session_id).maybeSingle();
    if (!p) throw new HttpError(404, 'not_found', 'Payment not found.');
    if (p.method !== 'card') throw new HttpError(400, 'invalid', 'Cash payments are settled outside MATCHDAY.');
    if (p.status === 'authorised') {
      await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
      return json({ released: true });
    }
    if (!['paid', 'partially_refunded'].includes(p.status)) throw new HttpError(400, 'invalid', 'Only completed payments can be refunded.');
    const refund = await stripe.refunds.create(
      {
        payment_intent: p.stripe_payment_intent_id,
        amount: body.amount_pence ?? undefined,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { payment_id: p.id, requested_by: user.id },
      },
      { idempotencyKey: `refund-${p.id}-${body.amount_pence ?? 'full'}` },
    );
    await admin.from('refunds').upsert(
      { payment_id: p.id, stripe_refund_id: refund.id, amount_pence: refund.amount, status: refund.status, reason: body.reason ?? null, requested_by: user.id },
      { onConflict: 'stripe_refund_id' },
    );
    return json({ refund_id: refund.id, status: refund.status });
  }
  throw new HttpError(400, 'invalid', 'Unknown action.');
}));
