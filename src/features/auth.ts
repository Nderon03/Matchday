import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/links';
import { toAppError } from '@/lib/errors';

WebBrowser.maybeCompleteAuthSession();

/** Optional OAuth sign-in. Works once the provider is enabled in Supabase Auth settings. */
export async function signInWithProvider(provider: 'google' | 'apple') {
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
      // always let people choose which Google account (otherwise Google silently picks the last one)
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  if (error) throw toAppError(error);
  if (Platform.OS === 'web') return;
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return;
  const code = new URL(res.url).searchParams.get('code');
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw toAppError(exErr);
  }
}

export function friendlyAuthError(e: unknown) {
  const msg = (e as Error)?.message ?? '';
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(msg)) return 'Please verify your email address first — check your inbox.';
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/provider is not enabled/i.test(msg)) return 'This sign-in method is not enabled yet.';
  return toAppError(e).message;
}
