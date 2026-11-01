// Scheduled payment housekeeping (every 15 minutes via pg_cron + pg_net):
//  * cancelled sessions → release holds / refund card payments
//  * host failed to confirm within 24h of the scheduled end → release holds (players are not charged);
//    the host can still confirm later, which converts released holds into pay-after requests.
import { adminClient, handler, json, requireCronSecret } from '../_shared/http.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { hostConfirmDeadline } from '../_shared/payments-core.ts';

Deno.serve(handler(async (req) => {
  requireCronSecret(req);
  const admin = adminClient();
  const stripe = stripeClient();
  const out = { released: 0, refunded: 0, notified: 0, errors: 0 };

  const { data: open } = await admin
    .from('payments')
    .select('id, status, payer_id, stripe_payment_intent_id, session:sessions(id, name, status, starts_at, duration_minutes, host_id, host_confirmed_at)')
    .in('status', ['authorised', 'paid'])
    .eq('method', 'card');

  const notifiedHosts = new Set<string>();
  for (const p of open ?? []) {
    const s = p.session as any;
    try {
      if (s.status === 'cancelled') {
        if (p.status === 'authorised') {
          await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
          out.released++;
        } else {
          await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id, reverse_transfer: true, refund_application_fee: true },
            { idempotencyKey: `cancel-refund-${p.id}` });
          out.refunded++;
        }
      } else if (p.status === 'authorised' && !s.host_confirmed_at && new Date() > hostConfirmDeadline(new Date(s.starts_at), s.duration_minutes)) {
        await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
        out.released++;
        if (!notifiedHosts.has(s.id) && s.host_id) {
          notifiedHosts.add(s.id);
          await admin.rpc('notify', {
            p_user: s.host_id, p_type: 'payment_hold_released', p_title: 'Card holds released',
            p_body: `You didn't confirm ${s.name} within 24 hours, so players' card holds were released. Confirm the session to request payment instead.`,
            p_data: { session_id: s.id },
          });
          out.notified++;
        }
      } else if (p.status === 'authorised' && s.host_confirmed_at) {
        // retry a capture that failed during host confirmation
        await stripe.paymentIntents.capture(p.stripe_payment_intent_id);
      }
    } catch (e) {
      console.error('payments-cron', p.id, e);
      out.errors++;
    }
  }
  return json(out);
}));
