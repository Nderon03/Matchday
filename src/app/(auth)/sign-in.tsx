import React, { useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Button, Input, Text } from '@/components/ui';
import { AuthShell, GoogleButton, OrDivider } from '@/features/AuthShell';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { signInSchema, fieldErrors } from '@/domain/validation';
import { friendlyAuthError, signInWithProvider } from '@/features/auth';
import { space } from '@/theme/tokens';

export default function SignIn() {
  // opened from the "Email confirmed → Open the app" button: email is pre-filled
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
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
    <AuthShell kicker="Welcome back" title="Ready for kick-off?" subtitle="Sign in to see your games, your squad and your stats."
      footer={(
        <Text variant="small" tone="muted" align="center">
          New to MATCHDAY? <Text variant="smallStrong" tone="primary" onPress={() => router.replace('/sign-up')}>Create an account</Text>
        </Text>
      )}>
      {/* social sign-in only appears once the provider is set up in Supabase (EXPO_PUBLIC_OAUTH_PROVIDERS) */}
      {env.oauthProviders.includes('google') && (
        <>
          <GoogleButton onPress={() => oauth('google')} />
          <OrDivider label="or with email" />
        </>
      )}
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" icon="mail-outline" error={errors.email} />
      <Input label="Password" value={password} onChangeText={setPassword} secure placeholder="Your password" autoComplete="current-password" textContentType="password" icon="lock-closed-outline" error={errors.password} onSubmitEditing={submit} returnKeyType="go" />
      <Link href="/forgot-password" style={{ alignSelf: 'flex-end', marginTop: -space.xs }}>
        <Text tone="primary" variant="smallStrong">Forgot password?</Text>
      </Link>
      {!!errors._ && <Text tone="danger" variant="small" accessibilityRole="alert">{errors._}</Text>}
      <Button title="Sign in" size="lg" iconRight="arrow-forward" loading={busy} onPress={submit} />
      {env.oauthProviders.includes('apple') && <Button title="Continue with Apple" variant="outline" icon="logo-apple" onPress={() => oauth('apple')} />}
    </AuthShell>
  );
}
