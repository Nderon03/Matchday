import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Loading, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type OtpType = 'recovery' | 'email' | 'signup' | 'invite' | 'magiclink' | 'email_change';
const OTP_TYPES: OtpType[] = ['recovery', 'email', 'signup', 'invite', 'magiclink', 'email_change'];

/**
 * Handles links from emails (sign-up confirmation, password reset) and OAuth redirects.
 * Email links carry a token_hash, which works on any device or browser: someone can ask for a
 * reset in the app and open the email on their laptop. OAuth sign-in uses a PKCE code.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; token_hash?: string; error_description?: string; type?: string }>();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(params.error_description ?? null);
  useEffect(() => {
    (async () => {
      if (params.token_hash && OTP_TYPES.includes(params.type as OtpType)) {
        const { error: e } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: params.type as OtpType });
        if (e) return setError(/expired|invalid/i.test(e.message) ? 'This link has expired or was already used. Request a new one.' : e.message);
      } else if (params.code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(params.code);
        if (e) {
          return setError(/verifier/i.test(e.message)
            ? 'Open the link on the same device and browser you used to request it, or request a new one.'
            : /expired/i.test(e.message) ? 'This link has expired. Request a new one.' : e.message);
        }
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setError((prev) => prev ?? 'This link is invalid or has expired.');
      router.replace(params.type === 'recovery' ? '/reset-password' : '/');
    })();
  }, [params.code, params.token_hash, params.type]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }}>
      {error ? (
        <>
          <Text variant="h3" align="center">Couldn’t verify that link</Text>
          <Text tone="muted" align="center">{error}</Text>
          <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <Loading label="Signing you in…" />
      )}
    </View>
  );
}
