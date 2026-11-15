import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { queryClient } from '@/lib/queryClient';
import { restoreOfflineCache, startOfflineCache } from '@/lib/offline';
import { LaunchCurtain } from '@/features/LaunchCurtain';
import { routeForNotification } from '@/lib/notifications';
import { useOtaUpdates } from '@/hooks/useOtaUpdates';
import { Sentry, rememberScreen, reportError, sentryEnabled, trackScreen } from '@/lib/sentry';
import { Button, ConfirmProvider, Text, ToastProvider } from '@/components/ui';
import { space } from '@/theme/tokens';

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
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const route = routeForNotification(res.notification.request.content.data as Record<string, any>);
      if (route) router.push(route as any);
    });
    return () => sub.remove();
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

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error), [error]);
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0C0F', alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }}>
      <Text variant="h2" color="#F4F6F8" align="center">Something went wrong</Text>
      <Text color="#97A1AE" align="center">{error.message}</Text>
      <Button title="Try again" onPress={retry} />
      <Button title="Go home" variant="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}
