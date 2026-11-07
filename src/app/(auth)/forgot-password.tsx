import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Input, Text } from '@/components/ui';
import { AuthShell } from '@/features/AuthShell';
import { useTheme } from '@/theme/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/links';
import { emailSchema } from '@/domain/validation';
import { friendlyAuthError } from '@/features/auth';
import { space } from '@/theme/tokens';

export default function ForgotPassword() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (e) return setError(friendlyAuthError(e));
    setSent(true);
  };
  return (
    <AuthShell kicker="Locked out?" title={sent ? 'Link on its way.' : 'Reset your password.'}
      subtitle={sent ? `If there’s an account for ${email}, a reset link is in your inbox. Open it on any device.` : 'Enter your email and we’ll send you a link to choose a new one.'}
      footer={<Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />}>
      {sent ? (
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
          <Ionicons name="paper-plane" size={40} color={colors.primary} />
          <Text variant="small" tone="muted" align="center">Check your junk folder if it doesn’t arrive in a minute.</Text>
        </View>
      ) : (
        <>
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" icon="mail-outline" error={error} onSubmitEditing={submit} />
          <Button title="Send reset link" size="lg" iconRight="arrow-forward" loading={busy} onPress={submit} />
        </>
      )}
    </AuthShell>
  );
}
