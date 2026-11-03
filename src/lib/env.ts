import { normaliseSupabaseUrl } from '@/domain/supabaseUrl';

export const env = {
  supabaseUrl: normaliseSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/^["']|["']$/g, ''),
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
  sentryDsn: (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim(),
  /** Social sign-in providers switched on in Supabase, e.g. "google,apple". Empty = email only. */
  oauthProviders: (process.env.EXPO_PUBLIC_OAUTH_PROVIDERS ?? '').split(',').map((x: string) => x.trim().toLowerCase()).filter((x: string): x is 'google' | 'apple' => x === 'google' || x === 'apple'),
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
