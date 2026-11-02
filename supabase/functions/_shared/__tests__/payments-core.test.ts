import Stripe from 'stripe';
import {
  bookingFee, paymentLines,
  verifyStripeSignature, patchFromEvent, shouldTransition, canPayUpfrontNow, hostConfirmDeadline, applicationFee,
  accountFlagsFromEvent, buildExpoMessages, chunk,
} from '../payments-core';

const secret = 'whsec_test_secret';
const stripe = new Stripe('sk_test_dummy');

describe('webhook signature verification', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });

  it('accepts a genuine Stripe signature', async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    await expect(verifyStripeSignature(payload, header, secret)).resolves.toEqual({ ok: true });
  });
  it('rejects a tampered payload', async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    await expect(verifyStripeSignature(payload.replace('pi_1', 'pi_2'), header, secret)).resolves.toMatchObject({ ok: false, reason: 'signature_mismatch' });
  });
  it('rejects the wrong secret', async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    await expect(verifyStripeSignature(payload, header, secret)).resolves.toMatchObject({ ok: false });
  });
  it('rejects replayed (stale) events', async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    await expect(verifyStripeSignature(payload, header, secret)).resolves.toMatchObject({ reason: 'timestamp_out_of_tolerance' });
  });
  it('rejects missing or malformed headers', async () => {
    await expect(verifyStripeSignature(payload, null, secret)).resolves.toMatchObject({ reason: 'missing_signature' });
    await expect(verifyStripeSignature(payload, 'garbage', secret)).resolves.toMatchObject({ reason: 'malformed_signature' });
    await expect(verifyStripeSignature(payload, 't=1,v1=abc', '')).resolves.toMatchObject({ reason: 'missing_secret' });
  });
});

describe('event → payment status mapping', () => {
  const ev = (type: string, object: Record<string, unknown>) => ({ id: 'evt', type, data: { object } });
  it('checkout completed (automatic capture) → paid', () => {
    expect(patchFromEvent(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { payment_id: 'p1' } })))
      .toMatchObject({ status: 'paid', lookup: { paymentId: 'p1' }, fields: { stripe_payment_intent_id: 'pi_1' } });
  });
  it('checkout completed (manual capture) stays pending until the hold is confirmed', () => {
    expect(patchFromEvent(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'unpaid', payment_intent: 'pi_1' }))?.status).toBe('pending');
    expect(patchFromEvent(ev('payment_intent.amount_capturable_updated', { id: 'pi_1' }))?.status).toBe('authorised');
  });
  it('failures, cancellations, refunds and disputes', () => {
    expect(patchFromEvent(ev('payment_intent.payment_failed', { id: 'pi', last_payment_error: { message: 'Card declined' } })))
      .toMatchObject({ status: 'failed', fields: { failure_reason: 'Card declined' } });
    expect(patchFromEvent(ev('payment_intent.canceled', { id: 'pi' }))?.status).toBe('cancelled');
    expect(patchFromEvent(ev('charge.refunded', { payment_intent: 'pi', amount: 600, amount_refunded: 600, refunds: { data: [{ id: 're_1', amount: 600, status: 'succeeded' }] } })))
      .toMatchObject({ status: 'refunded', refund: { stripeRefundId: 're_1', amountPence: 600 } });
    expect(patchFromEvent(ev('charge.refunded', { payment_intent: 'pi', amount: 600, amount_refunded: 300 }))?.status).toBe('partially_refunded');
    expect(patchFromEvent(ev('charge.dispute.created', { payment_intent: 'pi' }))?.status).toBe('disputed');
    expect(patchFromEvent(ev('checkout.session.expired', { id: 'cs' }))?.status).toBe('unpaid');
    expect(patchFromEvent(ev('customer.created', {}))).toBeNull();
  });
  it('account updates sync connected-account flags', () => {
    expect(accountFlagsFromEvent(ev('account.updated', { id: 'acct_1', charges_enabled: true, payouts_enabled: false, details_submitted: true })))
      .toEqual({ stripe_account_id: 'acct_1', charges_enabled: true, payouts_enabled: false, details_submitted: true });
  });
});

describe('status transitions never regress', () => {
  it.each([
    ['pending', 'paid', true],
    ['authorised', 'paid', true],
    ['paid', 'pending', false],
    ['paid', 'failed', false],
    ['paid', 'authorised', false],
    ['refunded', 'paid', false],
    ['paid', 'refunded', true],
    ['failed', 'pending', true],
    ['authorised', 'cancelled', true],
    ['paid', 'cancelled', false],
    ['pending', 'pending', false],
  ] as const)('%s → %s = %s', (from, to, expected) => expect(shouldTransition(from, to)).toBe(expected));
});

describe('upfront window and host confirmation deadline', () => {
  const kickoff = new Date('2026-11-11T19:00:00Z');
  it('opens six days before kick-off', () => {
    expect(canPayUpfrontNow(kickoff, new Date('2026-11-04T18:00:00Z')).ok).toBe(false);
    expect(canPayUpfrontNow(kickoff, new Date('2026-11-05T19:00:00Z')).ok).toBe(true);
  });
  it('host has 24 hours after the scheduled end', () => {
    expect(hostConfirmDeadline(kickoff, 60).toISOString()).toBe('2026-11-12T20:00:00.000Z');
  });
  it('application fee from basis points', () => {
    expect(applicationFee(600, 0)).toBe(0);
    expect(applicationFee(600, 250)).toBe(15);
    expect(applicationFee(600, 20000)).toBe(600);
  });
});

describe('push message building', () => {
  it('fans out to every device and batches', () => {
    const msgs = buildExpoMessages(
      [{ id: 'n1', user_id: 'u1', title: 'Hi', body: 'B', data: { session_id: 's' }, type: 'voting_open' }],
      { u1: ['ExponentPushToken[a]', 'ExponentPushToken[b]'] },
    );
    expect(msgs).toHaveLength(2);
    expect(msgs[0].data).toMatchObject({ session_id: 's', type: 'voting_open' });
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('booking fee and payment lines', () => {
  it('covers the card fee so the host receives the full amount', () => {
    expect(bookingFee(900)).toBe(35); // (13.5 + 20) / 0.985 = 34.01 → 35p
    expect(bookingFee(1000)).toBe(36);
    expect(bookingFee(0)).toBe(0);
    expect(bookingFee(900, 0, 0)).toBe(0);
    // after Stripe takes 1.5% + 20p of the total, the platform keeps at least £0
    for (const amount of [100, 500, 900, 1700, 9999]) {
      const fee = bookingFee(amount);
      const stripeFee = Math.round((amount + fee) * 0.015 + 20);
      expect(fee - stripeFee).toBeGreaterThanOrEqual(0);
    }
  });
  it('itemises session fee, fines and booking fee', () => {
    const r = paymentLines({ sessionPence: 900, fines: [{ label: 'Late fine', amount_pence: 200 }] });
    expect(r.lines.map((l) => [l.kind, l.amount_pence])).toEqual([['session', 900], ['fine', 200], ['fee', 38]]);
    expect(r).toMatchObject({ host_receives_pence: 1100, booking_fee_pence: 38, total_pence: 1138 });
    expect(paymentLines({ sessionPence: 900, fines: [], feeRateBps: 0, feeFixedPence: 0 }).lines).toHaveLength(1);
    // with the 50p minimum
    expect(paymentLines({ sessionPence: 900, fines: [], feeMinPence: 50 }).booking_fee_pence).toBe(50);
  });
});
