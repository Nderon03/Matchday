import { useEffect, useState } from 'react';
import { rpc } from '@/lib/api';
import { usernameSchema } from '@/domain/validation';

export type UsernameState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

/** Debounced live username availability check. Synchronous checks are derived; only the RPC is async. */
export function useUsernameCheck(username: string, current?: string) {
  const [result, setResult] = useState<{ name: string; state: 'available' | 'taken' | 'error' } | null>(null);
  const parsed = usernameSchema.safeParse(username);
  const isCurrent = !!current && username.toLowerCase() === current.toLowerCase();
  const needsCheck = !!username && parsed.success && !isCurrent;

  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    const t = setTimeout(() => {
      rpc<boolean>('is_username_available', { p_username: username })
        .then((ok) => !cancelled && setResult({ name: username, state: ok ? 'available' : 'taken' }))
        .catch(() => !cancelled && setResult({ name: username, state: 'error' }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, needsCheck]);

  if (!username) return { state: 'idle' as UsernameState, message: null };
  if (isCurrent) return { state: 'available' as UsernameState, message: 'This is your current username' };
  if (!parsed.success) return { state: 'invalid' as UsernameState, message: parsed.error.issues[0].message };
  if (result?.name !== username) return { state: 'checking' as UsernameState, message: 'Checking…' };
  const messages = { available: '✓ Available', taken: 'That username is taken', error: 'Could not check availability' };
  return { state: result.state as UsernameState, message: messages[result.state] };
}
