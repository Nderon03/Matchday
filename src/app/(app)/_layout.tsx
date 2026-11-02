import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { Loading } from '@/components/ui';
import { isConfigured } from '@/lib/env';
import { SetupRequired } from '@/features/SetupRequired';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { KickedNotice } from '@/features/KickedNotice';
import { TermsUpdatePrompt } from '@/features/LegalAgreement';
import { setCrashUser } from '@/lib/sentry';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';

export default function AppLayout() {
  const { session, initialising, profile, profileLoading } = useAuth();
  const { colors } = useTheme();
  const pathname = usePathname();
  usePushRegistration(!!session && !!profile?.onboarded);
  useEffect(() => setCrashUser(session?.user.id ?? null), [session?.user.id]);
  useLiveRefresh();
  // resume an invite link that was opened before signing in
  useEffect(() => {
    if (!session || !profile?.onboarded) return;
    AsyncStorage.getItem('matchday.pendingInvite').then((code) => {
      if (code) {
        AsyncStorage.removeItem('matchday.pendingInvite').catch(() => undefined);
        router.push(`/invite/${code}`);
      }
    }).catch(() => undefined);
  }, [session, profile?.onboarded]);

  if (!isConfigured) return <SetupRequired />;
  if (initialising || profileLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><Loading /></View>;
  }
  if (!session) return <Redirect href="/welcome" />;
  if (profile && !profile.onboarded && pathname !== '/onboarding') return <Redirect href="/onboarding" />;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
      {!!(profile?.onboarded) && <KickedNotice />}
      <TermsUpdatePrompt />
    </>
  );
}
