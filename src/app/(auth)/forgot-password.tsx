import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Header, Input, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/links';
import { emailSchema } from '@/domain/validation';
import { friendlyAuthError } from '@/features/auth';
import { space } from '@/theme/tokens';

export default function ForgotPassword() {
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
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <Header title="Reset password" />
      <View style={{ gap: space.lg }}>
        {sent ? (
          <Text tone="muted">If an account exists for {email}, a reset link is on its way. You can open it on any device — check your junk folder if it doesn’t arrive in a minute.</Text>
        ) : (
          <>
            <Text tone="muted">Enter your email and we’ll send you a link to reset your password.</Text>
            <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" icon="mail-outline" error={error} />
            <Button title="Send reset link" loading={busy} onPress={submit} />
          </>
        )}
      </View>
    </Screen>
  );
}
