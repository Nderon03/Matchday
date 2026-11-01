import Stripe from 'npm:stripe@17';
import { env } from './http.ts';

export function stripeClient() {
  return new Stripe(env('STRIPE_SECRET_KEY'), {
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function appUrl(path: string) {
  const base = Deno.env.get('APP_URL') ?? 'matchday://';
  return base.endsWith('/') || base.endsWith('://') ? `${base}${path.replace(/^\//, '')}` : `${base}/${path.replace(/^\//, '')}`;
}
