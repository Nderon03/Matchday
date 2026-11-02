/**
 * Runtime-agnostic payment logic shared by the Edge Functions (Deno) and the unit
 * tests (Node). No imports, no I/O: everything here is pure and deterministic,
 * except signature verification which uses the standard WebCrypto API.
 */

export type PaymentStatus =
  | 'unpaid' | 'pending' | 'authorised' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded' | 'disputed';

/** Card authorisations last ~7 days; upfront payment opens this long before kick-off. */
export const UPFRONT_WINDOW_HOURS = 6 * 24;
/** Host must confirm the session took place within this many hours of the scheduled end. */
export const HOST_CONFIRM_HOURS = 24;

export function upfrontWindowOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - UPFRONT_WINDOW_HOURS * 3600_000);
}

export function canPayUpfrontNow(startsAt: Date, now = new Date()): { ok: boolean; reason?: string; opensAt?: Date } {
  const opensAt = upfrontWindowOpensAt(startsAt);
  if (now < opensAt) return { ok: false, reason: 'window_not_open', opensAt };
  return { ok: true };
}

export function hostConfirmDeadline(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000 + HOST_CONFIRM_HOURS * 3600_000);
}

/** Platform fee in pence from basis points (e.g. 0 = no fee, 250 = 2.5%). */
export function applicationFee(amountPence: number, feeBps: number): number {
  if (!Number.isFinite(feeBps) || feeBps <= 0) return 0;
  return Math.min(amountPence, Math.round((amountPence * feeBps) / 10_000));
}

/**
 * Booking fee paid by the player so the host receives the full advertised amount and the
 * platform's Stripe processing fee (destination charges bill the platform) is covered.
 * Grossed up: fee = (amount × rate + fixed) / (1 − rate), rounded up. Defaults: UK cards 1.5% + 20p.
 */
export function bookingFee(amountPence: number, rateBps = 150, fixedPence = 20): number {
  if (amountPence <= 0 || (rateBps <= 0 && fixedPence <= 0)) return 0;
  const rate = Math.max(0, rateBps) / 10_000;
  return Math.ceil((amountPence * rate + Math.max(0, fixedPence)) / (1 - rate));
}

export interface PaymentLine {
  label: string;
  amount_pence: number;
  kind: 'session' | 'fine' | 'fee';
}

/** Lines shown before paying and on Stripe Checkout. */
export function paymentLines(opts: { sessionPence: number; fines: { label: string; amount_pence: number }[]; feeRateBps?: number; feeFixedPence?: number }) {
  const lines: PaymentLine[] = [];
  if (opts.sessionPence > 0) lines.push({ label: 'Session fee', amount_pence: opts.sessionPence, kind: 'session' });
  for (const f of opts.fines) if (f.amount_pence > 0) lines.push({ label: f.label, amount_pence: f.amount_pence, kind: 'fine' });
  const hostReceives = lines.reduce((a, l) => a + l.amount_pence, 0);
  const fee = bookingFee(hostReceives, opts.feeRateBps, opts.feeFixedPence);
  if (fee > 0) lines.push({ label: 'Booking fee', amount_pence: fee, kind: 'fee' });
  return { lines, host_receives_pence: hostReceives, booking_fee_pence: fee, total_pence: hostReceives + fee };
}

/** Allowed status transitions; webhooks may arrive out of order, so never regress. */
const ALLOWED_FROM: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['unpaid', 'failed', 'cancelled'],
  unpaid: ['pending', 'failed'],
  failed: ['pending', 'unpaid'],
  cancelled: ['authorised', 'pending', 'unpaid'],
  authorised: ['unpaid', 'pending', 'failed'],
  paid: ['unpaid', 'pending', 'failed', 'authorised'],
  partially_refunded: ['paid'],
  refunded: ['paid', 'partially_refunded', 'disputed'],
  disputed: ['paid', 'partially_refunded'],
};

export function shouldTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return from !== to && ALLOWED_FROM[to].includes(from);
}

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

export interface PaymentPatch {
  lookup: { checkoutSessionId?: string; paymentIntentId?: string; paymentId?: string };
  status?: PaymentStatus;
  fields?: Record<string, unknown>;
  refund?: { stripeRefundId: string; amountPence: number; status: string };
}

/** Translate a verified Stripe event into a payment update (or null if irrelevant). */
export function patchFromEvent(event: StripeEventLike): PaymentPatch | null {
  const o = event.data.object;
  const paymentId: string | undefined = o.metadata?.payment_id ?? o.payment_intent_data?.metadata?.payment_id;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;
      const lookup = { checkoutSessionId: o.id, paymentId };
      if (o.payment_status === 'paid') return { lookup, status: 'paid', fields: { stripe_payment_intent_id: pi, paid_at: new Date((o.created ?? Date.now() / 1000) * 1000).toISOString() } };
      // manual capture: card authorised, not yet charged
      return { lookup, status: 'pending', fields: { stripe_payment_intent_id: pi } };
    }
    case 'checkout.session.async_payment_failed':
      return { lookup: { checkoutSessionId: o.id, paymentId }, status: 'failed', fields: { failure_reason: 'Your bank declined the payment.' } };
    case 'checkout.session.expired':
      return { lookup: { checkoutSessionId: o.id, paymentId }, status: 'unpaid', fields: { stripe_checkout_session_id: null } };
    case 'payment_intent.amount_capturable_updated':
      return { lookup: { paymentIntentId: o.id, paymentId }, status: 'authorised', fields: { authorised_at: new Date().toISOString() } };
    case 'payment_intent.succeeded':
      return {
        lookup: { paymentIntentId: o.id, paymentId },
        status: 'paid',
        fields: { paid_at: new Date().toISOString(), receipt_url: o.latest_charge?.receipt_url ?? null },
      };
    case 'payment_intent.payment_failed':
      return {
        lookup: { paymentIntentId: o.id, paymentId },
        status: 'failed',
        fields: { failure_reason: o.last_payment_error?.message ?? 'The payment failed.' },
      };
    case 'payment_intent.canceled':
      return { lookup: { paymentIntentId: o.id, paymentId }, status: 'cancelled' };
    case 'charge.refunded': {
      const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;
      const full = o.amount_refunded >= o.amount;
      const latest = o.refunds?.data?.[0];
      return {
        lookup: { paymentIntentId: pi, paymentId },
        status: full ? 'refunded' : 'partially_refunded',
        refund: latest ? { stripeRefundId: latest.id, amountPence: latest.amount, status: latest.status } : undefined,
      };
    }
    case 'charge.dispute.created': {
      const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;
      return { lookup: { paymentIntentId: pi }, status: 'disputed' };
    }
    default:
      return null;
  }
}

export function accountFlagsFromEvent(event: StripeEventLike) {
  if (event.type !== 'account.updated') return null;
  const a = event.data.object;
  return {
    stripe_account_id: a.id as string,
    charges_enabled: Boolean(a.charges_enabled),
    payouts_enabled: Boolean(a.payouts_enabled),
    details_submitted: Boolean(a.details_submitted),
  };
}

// ---------------------------------------------------------------------------
// Stripe webhook signature verification (v1 scheme, HMAC-SHA256), WebCrypto only.
// ---------------------------------------------------------------------------
function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!header) return { ok: false, reason: 'missing_signature' };
  if (!secret) return { ok: false, reason: 'missing_secret' };
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return { ok: false, reason: 'malformed_signature' };
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  return sigs.some((s) => safeEqual(s, expected)) ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}

// ---------------------------------------------------------------------------
// Push notifications (Expo push service) helpers
// ---------------------------------------------------------------------------
export interface QueuedNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  type: string;
}

export function buildExpoMessages(notifications: QueuedNotification[], tokensByUser: Record<string, string[]>) {
  const messages: { to: string; title: string; body: string; data: Record<string, unknown>; sound: 'default'; channelId: string; notificationId: string }[] = [];
  for (const n of notifications) {
    for (const to of tokensByUser[n.user_id] ?? []) {
      messages.push({ to, title: n.title, body: n.body, data: { ...n.data, type: n.type, notification_id: n.id }, sound: 'default', channelId: 'default', notificationId: n.id });
    }
  }
  return messages;
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
