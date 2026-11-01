import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Loading, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Handles email verification, magic links and password-recovery redirects (PKCE). */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error_description?: string; type?: string }>();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(params.error_description ?? null);
  useEffect(() => {
    (async () => {
      if (params.code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(params.code);
        if (e) return setError(e.message.includes('expired') ? 'This link has expired. Request a new one.' : e.message);
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setError((prev) => prev ?? 'This link is invalid or has expired.');
      router.replace(params.type === 'recovery' ? '/reset-password' : '/');
    })();
  }, [params.code, params.type]);
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
