import React, { useEffect, useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { Stack, router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { queryClient } from '@/lib/queryClient';
import { restoreOfflineCache, startOfflineCache } from '@/lib/offline';
import { LaunchCurtain } from '@/features/LaunchCurtain';
import { onNotificationTap, routeForNotification } from '@/lib/notifications';
import { useOtaUpdates } from '@/hooks/useOtaUpdates';
import { Sentry, rememberScreen, reportError, sentryEnabled, trackScreen } from '@/lib/sentry';
import { ConfirmProvider, ToastProvider } from '@/components/ui';

// only the weights we use, trimmed to Latin + symbols (scripts/subset-fonts.py) to keep the app small
const FONTS = {
  Inter_400Regular: require('../../assets/fonts/Inter_400Regular.ttf'),
  Inter_500Medium: require('../../assets/fonts/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('../../assets/fonts/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('../../assets/fonts/Inter_700Bold.ttf'),
  Inter_800ExtraBold: require('../../assets/fonts/Inter_800ExtraBold.ttf'),
  BarlowCondensed_700Bold: require('../../assets/fonts/BarlowCondensed_700Bold.ttf'),
  BarlowCondensed_800ExtraBold: require('../../assets/fonts/BarlowCondensed_800ExtraBold.ttf'),
};

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function ThemedStack() {
  const { colors, scheme } = useTheme();
  useOtaUpdates();
  // crash reports show the last screens visited
  const pathname = usePathname();
  useEffect(() => { trackScreen(pathname); rememberScreen(pathname); }, [pathname]);
  useEffect(() => {
    return onNotificationTap((data) => {
      const route = routeForNotification(data);
      if (route) router.push(route as any);
    });
  }, []);
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
      <LaunchCurtain />
    </>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts(FONTS);
  // what you loaded last time, so the app opens with it even without signal
  const [cacheReady, setCacheReady] = useState(false);
  useEffect(() => {
    restoreOfflineCache().finally(() => setCacheReady(true));
    return startOfflineCache();
  }, []);
  const ready = (loaded || !!error) && cacheReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <ThemedStack />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Top-level error boundary: recover without leaving the user stuck. */
export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;

/**
 * The safety net when a screen hits an error. It sits outside the app's providers (theme, fonts,
 * toasts), so it must only use plain React Native: if it used themed components it would fail too
 * and leave a black screen. Shows the error so a screenshot is enough to fix it.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error), [error]);
  const where = (error.stack ?? '').split('\n').find((l) => /\bat\b/.test(l))?.trim();
  const btn = (label: string, onPress: () => void, primary?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ alignSelf: 'stretch', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? '#22C55E' : 'transparent' }}>
      <RNText style={{ color: primary ? '#04130A' : '#22C55E', fontSize: 16, fontWeight: '700' }}>{label}</RNText>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0C0F', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <RNText style={{ color: '#F4F6F8', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Something went wrong</RNText>
      <RNText style={{ color: '#97A1AE', fontSize: 15, textAlign: 'center' }}>{error.message}</RNText>
      {!!where && <RNText selectable style={{ color: '#5F6B78', fontSize: 11, textAlign: 'center' }}>{where}</RNText>}
      <View style={{ height: 8 }} />
      {btn('Try again', retry, true)}
      {btn('Go home', () => { retry(); router.replace('/'); })}
    </View>
  );
}
