import React, { useEffect } from 'react';
import { Linking, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Public landing page after Stripe (checkout or payout setup). On the phone this opens in an in-app
 * browser that isn't signed in, so instead of a sign-in screen it says what happened and offers a
 * button back into the app. Signed-in web users go straight on to the right screen.
 */
const COPY = {
  paid: { icon: 'checkmark-circle', title: 'Payment received', message: 'Thanks! Your payment status updates in MATCHDAY within a few seconds.' },
  cancelled: { icon: 'close-circle', title: 'Payment cancelled', message: 'You have not been charged. You can pay any time from the game page.' },
  payouts: { icon: 'wallet', title: 'Payout setup saved', message: 'Your Stripe details were submitted. MATCHDAY shows your payout status once Stripe has checked them.' },
  'payouts-retry': { icon: 'refresh-circle', title: 'Let’s try that again', message: 'The setup link expired. Go back to MATCHDAY and tap “Set up payouts” again.' },
} as const;

export default function Done() {
  const { kind, session } = useLocalSearchParams<{ kind?: keyof typeof COPY; session?: string }>();
  const { session: auth } = useAuth();
  const { colors } = useTheme();
  const k = kind && kind in COPY ? kind : 'paid';
  const c = COPY[k];
  const path = k === 'payouts' || k === 'payouts-retry'
    ? `settings/payouts${k === 'payouts' ? '?done=1' : '?refresh=1'}`
    : session ? `session/${session}/payments?checkout=${k === 'paid' ? 'success' : 'cancelled'}` : '';

  useEffect(() => {
    // signed in on the web (paid from a browser): carry straight on
    if (Platform.OS === 'web' && auth) router.replace(`/${path}` as any);
  }, [auth, path]);

  const openApp = () => {
    if (Platform.OS === 'web') Linking.openURL(`matchday://${path}`).catch(() => undefined);
    else router.replace(`/${path}` as any);
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl * 2 }}>
        <Ionicons name={c.icon} size={72} color={k === 'cancelled' ? colors.textMuted : colors.primary} />
        <Text variant="h1" align="center">{c.title}</Text>
        <Text tone="muted" align="center">{c.message}</Text>
        <Button title="Back to MATCHDAY" icon="arrow-back" size="lg" onPress={openApp} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
        <Text variant="caption" tone="faint" align="center">On your phone, you can also just close this window.</Text>
      </View>
    </Screen>
  );
}
