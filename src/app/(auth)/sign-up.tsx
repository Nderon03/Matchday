import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Header, Input, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/links';
import { signUpSchema, fieldErrors } from '@/domain/validation';
import { friendlyAuthError } from '@/features/auth';
import { useUsernameCheck } from '@/hooks/useUsernameCheck';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function SignUp() {
  const { colors } = useTheme();
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const check = useUsernameCheck(form.username);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (check.state === 'taken') return setErrors({ username: 'That username is taken' });
    setErrors({});
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: authRedirectUrl(), data: { username: parsed.data.username, display_name: parsed.data.displayName } },
    });
    setBusy(false);
    if (error) return setErrors({ _: friendlyAuthError(error) });
    if (data.session) router.replace('/onboarding');
    else setSentTo(parsed.data.email);
  };

  if (sentTo) {
    return (
      <Screen edges={['top', 'bottom']} maxWidth={480}>
        <Header title="Verify your email" />
        <Card>
          <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
            <Ionicons name="mail-unread-outline" size={44} color={colors.primary} />
            <Text variant="h3" align="center">Check your inbox</Text>
            <Text tone="muted" align="center">We sent a verification link to {sentTo}. Open it on any device (check junk if it’s not there in a minute), then sign in.</Text>
            <Button title="Resend email" variant="secondary" onPress={async () => {
              const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: authRedirectUrl() } });
              setErrors(error ? { _: friendlyAuthError(error) } : { _: 'Sent again.' });
            }} />
            {!!errors._ && <Text variant="small" tone="muted">{errors._}</Text>}
          </View>
        </Card>
        <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <Header title="Create your account" />
      <View style={{ gap: space.lg }}>
        <Input label="Display name" value={form.displayName} onChangeText={set('displayName')} placeholder="e.g. Sam Carter" autoComplete="name" icon="person-outline" error={errors.displayName} />
        <Input
          label="Username"
          value={form.username}
          onChangeText={(v) => set('username')(v.replace(/\s/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. samcarter"
          icon="at"
          error={errors.username ?? (check.state === 'taken' || check.state === 'invalid' ? check.message : null)}
          hint={check.state === 'available' || check.state === 'checking' ? check.message ?? undefined : 'Letters, numbers and underscores'}
        />
        <Input label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" icon="mail-outline" error={errors.email} />
        <Input label="Password" value={form.password} onChangeText={set('password')} secure placeholder="Create a password" autoComplete="new-password" textContentType="newPassword" icon="lock-closed-outline" error={errors.password} hint="At least 8 characters with a letter and a number" />
        {!!errors._ && <Text tone="danger" variant="small" accessibilityRole="alert">{errors._}</Text>}
        <Button title="Create account" size="lg" loading={busy} onPress={submit} disabled={check.state === 'checking'} />
        <Text variant="caption" tone="faint" align="center">
          By creating an account you agree to the{' '}
          <Text variant="caption" tone="primary" onPress={() => router.push('/legal/terms')}>Terms of Use</Text>
          {' '}and{' '}
          <Text variant="caption" tone="primary" onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>.
        </Text>
      </View>
    </Screen>
  );
}
