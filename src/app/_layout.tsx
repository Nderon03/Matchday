import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { queryClient } from '@/lib/queryClient';
import { routeForNotification } from '@/lib/notifications';
import { useOtaUpdates } from '@/hooks/useOtaUpdates';
import { Sentry, reportError, sentryEnabled } from '@/lib/sentry';
import { Button, ConfirmProvider, Text, ToastProvider } from '@/components/ui';
import { space } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function ThemedStack() {
  const { colors, scheme } = useTheme();
  useOtaUpdates();
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
    </>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);
  if (!loaded && !error) return null;
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
