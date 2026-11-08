import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { env } from './env';

/** Base URL for shareable links: configured web origin, else the current web origin, else the app scheme. */
function webBase(): string | null {
  const configured = env.appUrl.trim();
  // ignore the placeholder from .env.example
  if (configured && !configured.includes('.example')) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return null;
}

/** Shareable link to any screen (web address when available, else the app scheme). */
export function appLink(path: string) {
  const base = webBase();
  return base ? `${base}${path}` : Linking.createURL(path);
}

/** Shareable link for an invite code. */
export function inviteUrl(code: string) {
  const base = webBase();
  return base ? `${base}/invite/${code}` : Linking.createURL(`/invite/${code}`);
}

/**
 * Where sign-in and email links come back to. In the app it's always exactly
 * `matchday://auth/callback` (Linking.createURL writes `matchday:///…` with three slashes, which
 * doesn't match the Redirect URLs allowed in Supabase, so Supabase would send people to the
 * website instead of back into the app).
 */
export function authRedirectUrl() {
  if (Platform.OS === 'web') return Linking.createURL('/auth/callback');
  const scheme = Linking.createURL('/').split(':')[0];
  return scheme === 'exp' || scheme === 'exps' ? Linking.createURL('/auth/callback') : `${scheme}://auth/callback`;
}
