/** Turns backend / network failures into clear, user-facing messages. Never fail silently. */
export class AppError extends Error {
  constructor(public code: string, message: string, public cause?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}

const FRIENDLY: Record<string, string> = {
  network: 'Network connection interrupted. Check your signal and try again.',
  not_authenticated: 'Your session has expired. Please sign in again.',
  forbidden: 'You don’t have permission to do that.',
  not_found: 'We couldn’t find that. It may have been removed.',
  already_voted: 'You’ve already submitted that vote.',
  invite_expired: 'This invitation has expired.',
  rate_limited: 'You’re doing that too often. Please wait a moment.',
  not_configured: 'This feature hasn’t been configured on the server yet.',
  host_not_ready: 'The host hasn’t finished setting up payouts yet.',
  internal: 'Something went wrong on our side. Please try again.',
  PGRST116: 'We couldn’t find that. It may have been removed.',
  '23505': 'That already exists.',
};

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { hint?: string; code?: string; message?: string; status?: number; name?: string; context?: any };
  const msg = err?.message ?? '';
  if (err?.name === 'TypeError' && /fetch|network/i.test(msg)) return new AppError('network', FRIENDLY.network, e);
  if (/Failed to fetch|Network request failed|NetworkError/i.test(msg)) return new AppError('network', FRIENDLY.network, e);
  // Our database functions raise with HINT = stable code and a human message.
  if (err?.hint && typeof err.hint === 'string' && /^[a-z_]+$/.test(err.hint)) return new AppError(err.hint, msg || FRIENDLY[err.hint] || FRIENDLY.internal, e);
  if (err?.code === '42501') return new AppError('forbidden', FRIENDLY.forbidden, e);
  if (err?.code && FRIENDLY[err.code]) return new AppError(err.code, FRIENDLY[err.code], e);
  if (msg && msg.length < 200) return new AppError(err?.code ?? 'error', msg, e);
  return new AppError('internal', FRIENDLY.internal, e);
}

export function errorMessage(e: unknown) {
  return toAppError(e).message;
}
