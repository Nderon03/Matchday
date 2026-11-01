import { supabase } from './supabase';
import { AppError, toAppError } from './errors';

/** Call a Postgres RPC and throw a friendly AppError on failure. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw toAppError(error);
  return data as T;
}

/** Invoke an Edge Function; surfaces the function's structured error. */
export async function invoke<T = unknown>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new AppError(payload.error.code, payload.error.message);
    }
    throw toAppError(error);
  }
  if ((data as any)?.error) throw new AppError((data as any).error.code, (data as any).error.message);
  return data as T;
}

/** Unwrap a PostgREST query result. */
export async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  return data as T;
}
