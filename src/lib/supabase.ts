import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { env, isConfigured } from './env';

/**
 * Public Supabase client. Uses only the anon key; every request is authorised by RLS
 * and SECURITY DEFINER functions server-side. The session token is cached on-device
 * (AsyncStorage / localStorage) purely for persistence — the database is authoritative.
 */
export const supabase = createClient(
  isConfigured ? env.supabaseUrl : 'https://example.supabase.co',
  isConfigured ? env.supabaseAnonKey : 'public-anon-key-not-configured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
