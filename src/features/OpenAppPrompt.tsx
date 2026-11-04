import React from 'react';
import { Linking, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** True on a phone's web browser (where the person most likely has the app installed). */
export function isMobileWeb() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Shown on the website after an email link (sign-up confirmation, password reset) is opened on a
 * phone: a button back into the app, plus the option to carry on in the browser.
 */
export function OpenAppPrompt({ title, message }: { title: string; message: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }}>
      <Ionicons name="checkmark-circle" size={72} color={colors.primary} />
      <Text variant="h1" align="center">{title}</Text>
      <Text tone="muted" align="center">{message}</Text>
      <Button title="Open the MATCHDAY app" icon="phone-portrait-outline" size="lg" style={{ alignSelf: 'stretch', maxWidth: 420, width: '100%', marginTop: space.lg }}
        onPress={() => Linking.openURL('matchday://sign-in').catch(() => undefined)} />
      <Button title="Continue on the website" variant="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}
