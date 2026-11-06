import React, { useEffect } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** True on a phone's web browser (where the person most likely has the app installed). */
export function isMobileWeb() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Shown on a phone's browser when an email link (sign-up confirmation, password reset) is opened:
 * it tries to open the app straight away with the link's one-time code, so the app signs the
 * person in; the button does the same, and they can carry on in the browser instead.
 */
export function OpenAppPrompt({ title, message, appLink, onContinueWeb }: { title: string; message: string; appLink: string; onContinueWeb: () => void }) {
  const { colors } = useTheme();
  useEffect(() => {
    // most browsers allow this on page load from an email link; the button is there if not
    const t = setTimeout(() => { Linking.openURL(appLink).catch(() => undefined); }, 300);
    return () => clearTimeout(t);
  }, [appLink]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }}>
      <Ionicons name="mail-open-outline" size={64} color={colors.primary} />
      <Text variant="h1" align="center">{title}</Text>
      <Text tone="muted" align="center">{message}</Text>
      <Button title="Open the MATCHDAY app" icon="phone-portrait-outline" size="lg" style={{ alignSelf: 'stretch', maxWidth: 420, width: '100%', marginTop: space.lg }}
        onPress={() => Linking.openURL(appLink).catch(() => undefined)} />
      <Button title="Continue in the browser" variant="ghost" onPress={onContinueWeb} />
    </View>
  );
}
