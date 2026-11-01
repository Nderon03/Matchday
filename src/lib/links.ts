import * as Linking from 'expo-linking';
import { env } from './env';

/** Shareable link for an invite code. Uses the web origin when configured, otherwise the app scheme. */
export function inviteUrl(code: string) {
  if (env.appUrl) return `${env.appUrl.replace(/\/$/, '')}/invite/${code}`;
  return Linking.createURL(`/invite/${code}`);
}

export function authRedirectUrl() {
  return Linking.createURL('/auth/callback');
}
