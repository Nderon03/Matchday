import { normaliseSupabaseUrl } from '@/domain/supabaseUrl';

export const env = {
  supabaseUrl: normaliseSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/^["']|["']$/g, ''),
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
