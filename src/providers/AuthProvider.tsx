import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startRecovery } from '@/lib/recovery';
import { supabase } from '@/lib/supabase';
import { q } from '@/lib/api';
import type { Profile } from '@/types/db';
import { clearOfflineCache } from '@/lib/offline';

interface AuthCtx {
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  initialising: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialising(false);
    }).catch(() => setInitialising(false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        startRecovery();
        router.replace('/reset-password');
      }
      if (event === 'SIGNED_OUT') { qc.clear(); clearOfflineCache(); }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id ?? null;
  const profileQuery = useQuery({
    queryKey: ['profile', 'me', userId],
    enabled: !!userId,
    queryFn: () => q<Profile>(supabase.from('profiles').select('*').eq('id', userId!).single()),
  });

  const value = useMemo<AuthCtx>(() => ({
    session,
    userId,
    profile: profileQuery.data ?? null,
    initialising,
    profileLoading: !!userId && profileQuery.isLoading,
    refreshProfile: () => profileQuery.refetch(),
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
      await clearOfflineCache();
      router.replace('/welcome');
    },
  }), [session, userId, profileQuery, initialising, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
