/**
 * A fake Stripe API for the payment rehearsal: answers the calls our functions make (checkout pages,
 * capture, release, refunds), records every request so tests can check exactly what we asked Stripe
 * to charge, and builds the signed webhook events Stripe would send back.
 */
export interface Call { method: string; path: string; params: Record<string, string> }

export class FakeStripe {
  calls: Call[] = [];
  private n = 0;
  sessions = new Map<string, any>();
  intents = new Map<string, any>();
  private id = (p: string) => `${p}_test_${++this.n}_${crypto.randomUUID().slice(0, 8)}`;

  reset() { this.calls = []; }
  callsTo(path: RegExp) { return this.calls.filter((c) => path.test(c.path)); }

  handle(method: string, path: string, body: string): Response {
    const params = Object.fromEntries(new URLSearchParams(body));
    this.calls.push({ method, path, params });
    if (Deno.env.get('GW_DEBUG')) console.log('STRIPE', method, path);
    const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_fake' } });
    let m: RegExpMatchArray | null;

    if (method === 'POST' && path === '/v1/checkout/sessions') {
      const items = Object.keys(params).filter((k) => /^line_items\[\d+\]\[price_data\]\[unit_amount\]$/.test(k));
      const total = items.reduce((a, k) => a + Number(params[k]), 0);
      const id = this.id('cs');
      const s = { id, object: 'checkout.session', status: 'open', url: `https://checkout.stripe.test/${id}`, amount_total: total, params,
        metadata: { payment_id: params['metadata[payment_id]'], session_id: params['metadata[session_id]'] } };
      this.sessions.set(id, s);
      return ok(s);
    }
    if (method === 'GET' && (m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/))) return ok(this.sessions.get(m[1]));
    if (method === 'POST' && (m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/))) {
      const s = this.sessions.get(m[1]); s.status = 'expired'; return ok(s);
    }
    if (method === 'POST' && (m = path.match(/^\/v1\/payment_intents\/([^/]+)\/(capture|cancel)$/))) {
      const pi = this.intents.get(m[1]);
      if (!pi) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'No such payment_intent' } }), { status: 404 });
      pi.status = m[2] === 'capture' ? 'succeeded' : 'canceled';
      return ok(pi);
    }
    if (method === 'POST' && path === '/v1/refunds') {
      const pi = this.intents.get(params.payment_intent);
      return ok({ id: this.id('re'), object: 'refund', amount: Number(params.amount ?? pi?.amount), status: 'succeeded', payment_intent: params.payment_intent });
    }
    return new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: `fake stripe: no route ${method} ${path}` } }), { status: 404 });
  }

  /** The player finishes the Stripe page: a payment intent now exists (held, or already charged). */
  completeCheckout(sessionId: string) {
    const s = this.sessions.get(sessionId);
    const manual = s.params['payment_intent_data[capture_method]'] === 'manual';
    const pi = { id: this.id('pi'), object: 'payment_intent', amount: s.amount_total, status: manual ? 'requires_capture' : 'succeeded',
      metadata: { payment_id: s.params['payment_intent_data[metadata][payment_id]'] }, latest_charge: { receipt_url: 'https://pay.stripe.test/receipt' } };
    this.intents.set(pi.id, pi);
    s.status = 'complete'; s.payment_intent = pi.id; s.payment_status = manual ? 'unpaid' : 'paid';
    return { session: s, intent: pi };
  }
}

let eventN = 0;
export function event(type: string, object: Record<string, unknown>, id = `evt_test_${++eventN}_${crypto.randomUUID().slice(0, 8)}`) {
  return { id, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } };
}

export async function sign(payload: string, secret: string, at = Math.floor(Date.now() / 1000)) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${at}.${payload}`))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${at},v1=${sig}`;
}
