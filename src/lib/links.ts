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

export function authRedirectUrl() {
  return Linking.createURL('/auth/callback');
}
