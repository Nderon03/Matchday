// Host payout onboarding with Stripe Connect (Express accounts, UK).
// Stripe performs identity verification (KYC) and manages payouts; MATCHDAY never holds funds.
import { adminClient, handler, json, requireUser } from '../_shared/http.ts';
import { appUrl, stripeClient } from '../_shared/stripe.ts';
import { canReceivePayments } from '../_shared/payments-core.ts';

Deno.serve(handler(async (req) => {
  const { user } = await requireUser(req);
  const { action } = (await req.json().catch(() => ({}))) as { action?: 'onboard' | 'status' | 'dashboard' };
  const stripe = stripeClient();
  const admin = adminClient();

  const { data: existing } = await admin.from('payment_accounts').select('*').eq('user_id', user.id).maybeSingle();
  let accountId = existing?.stripe_account_id as string | undefined;

  if (action === 'status') {
    if (!accountId) return json({ connected: false });
    const acct = await stripe.accounts.retrieve(accountId);
    const flags = { charges_enabled: canReceivePayments(acct as any), payouts_enabled: acct.payouts_enabled, details_submitted: acct.details_submitted };
    await admin.from('payment_accounts').update(flags).eq('user_id', user.id);
    return json({ connected: true, ...flags, requirements: acct.requirements?.currently_due ?? [] });
  }

  if (action === 'dashboard') {
    if (!accountId) return json({ error: { code: 'not_connected', message: 'Set up payouts first.' } }, 400);
    const link = await stripe.accounts.createLoginLink(accountId);
    return json({ url: link.url });
  }

  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email: user.email,
      business_type: 'individual',
      // Players pay the platform and Stripe transfers the host's share (destination charges).
      // UK platform + UK hosts use the standard (full) service agreement; the "recipient"
      // agreement is only for cross-border payouts and Stripe rejects it domestically.
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: '7941', product_description: 'Collecting player contributions for casual football sessions' },
      metadata: { matchday_user_id: user.id },
    });
    accountId = acct.id;
    await admin.from('payment_accounts').insert({ user_id: user.id, stripe_account_id: accountId });
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: appUrl('done?kind=payouts-retry'),
    return_url: appUrl('done?kind=payouts'),
  });
  return json({ url: link.url });
}));
