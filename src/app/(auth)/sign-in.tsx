import React, { useState } from 'react';
import { View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button, Header, Input, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { signInSchema, fieldErrors } from '@/domain/validation';
import { friendlyAuthError, signInWithProvider } from '@/features/auth';
import { space } from '@/theme/tokens';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password });
    setBusy(false);
    if (error) return setErrors({ _: friendlyAuthError(error) });
    router.replace('/');
  };

  const oauth = async (p: 'google' | 'apple') => {
    try {
      await signInWithProvider(p);
    } catch (e) {
      setErrors({ _: friendlyAuthError(e) });
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <Header title="Welcome back" />
      <View style={{ gap: space.lg }}>
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" icon="mail-outline" error={errors.email} />
        <Input label="Password" value={password} onChangeText={setPassword} secure autoComplete="current-password" textContentType="password" icon="lock-closed-outline" error={errors.password} onSubmitEditing={submit} returnKeyType="go" />
        {!!errors._ && <Text tone="danger" variant="small" accessibilityRole="alert">{errors._}</Text>}
        <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
        <Link href="/forgot-password" style={{ alignSelf: 'center' }}>
          <Text tone="primary" variant="smallStrong">Forgot your password?</Text>
        </Link>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Text variant="caption" tone="faint" align="center">OR</Text>
          <Button title="Continue with Google" variant="outline" icon="logo-google" onPress={() => oauth('google')} />
          <Button title="Continue with Apple" variant="outline" icon="logo-apple" onPress={() => oauth('apple')} />
        </View>
        <Text variant="small" tone="muted" align="center">
          New to MATCHDAY? <Text variant="smallStrong" tone="primary" onPress={() => router.replace('/sign-up')}>Create an account</Text>
        </Text>
      </View>
    </Screen>
  );
}
