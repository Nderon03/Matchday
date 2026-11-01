/**
 * Normalise the Supabase URL: people often paste the "RESTful endpoint"
 * (https://<ref>.supabase.co/rest/v1/) or a URL with a trailing slash. The client
 * needs the bare project origin, otherwise auth calls hit invalid paths.
 */
export function normaliseSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`;
  } catch {
    return trimmed.replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
  }
}

export const env = {
  supabaseUrl: normaliseSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/^["']|["']$/g, ''),
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
