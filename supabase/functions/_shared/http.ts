// Shared HTTP + Supabase helpers for Edge Functions (Deno runtime).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(503, 'not_configured', `${name} is not configured on the server.`);
  return v;
}

/** Service-role client: bypasses RLS. Only ever used server-side. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Client acting as the calling user (RLS + RPC permission checks apply). */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'not_authenticated', 'You need to be signed in.');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
}

export async function requireUser(req: Request) {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'not_authenticated', 'Your session has expired. Please sign in again.');
  return { client, user: data.user };
}

/** Only scheduled jobs (pg_cron via pg_net) may call cron functions. */
export function requireCronSecret(req: Request) {
  const expected = env('CRON_SECRET');
  if (req.headers.get('x-cron-secret') !== expected) throw new HttpError(401, 'forbidden', 'Invalid cron secret.');
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
      const pg = e as { hint?: string; message?: string };
      if (pg?.hint) return json({ error: { code: pg.hint, message: pg.message } }, 400);
      console.error(e);
      return json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, 500);
    }
  };
}
