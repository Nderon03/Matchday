import React, { useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/links';
import { env } from '@/lib/env';
import { signUpSchema, fieldErrors } from '@/domain/validation';
import { friendlyAuthError, signInWithProvider } from '@/features/auth';
import { AuthShell, GoogleButton, OrDivider, PasswordStrength, Rise } from '@/features/AuthShell';
import { useUsernameCheck } from '@/hooks/useUsernameCheck';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

/** Two quick steps: who you are (name, username), then your login (email, password). */
export default function SignUp() {
  const { colors } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const check = useUsernameCheck(form.username);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const next = () => {
    const parsed = signUpSchema.pick({ displayName: true, username: true }).safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (check.state === 'taken' || check.state === 'invalid') return setErrors({ username: check.message ?? 'Pick another username' });
    setErrors({});
    haptics.tap();
    setStep(2);
  };

  const submit = async () => {
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      const e = fieldErrors(parsed.error);
      if (e.displayName || e.username) setStep(1);
      return setErrors(e);
    }
    if (check.state === 'taken') { setStep(1); return setErrors({ username: 'That username is taken' }); }
    setErrors({});
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: authRedirectUrl(), data: { username: parsed.data.username, display_name: parsed.data.displayName } },
    });
    setBusy(false);
    if (error) return setErrors({ _: friendlyAuthError(error) });
    haptics.success();
    if (data.session) router.replace('/onboarding');
    else setSentTo(parsed.data.email);
  };

  if (sentTo) return <CheckInbox email={sentTo} />;

  const first = form.displayName.trim().split(' ')[0];
  return (
    <AuthShell kicker={`Step ${step} of 2`} title={step === 1 ? 'Join the squad.' : first ? `Nice one, ${first}.` : 'Nearly there.'}
      subtitle={step === 1 ? 'Your games, your stats, your player card. It takes a minute.' : 'Now your login, and you’re in.'}
      footer={(
        <Text variant="small" tone="muted" align="center">
          Already playing? <Text variant="smallStrong" tone="primary" onPress={() => router.replace('/sign-in')}>Sign in</Text>
        </Text>
      )}>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step} of 2`}>
        {[1, 2].map((n) => <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: n <= step ? colors.primary : colors.border }} />)}
      </View>
      {step === 1 ? (
        <Rise key="s1">
          <View style={{ gap: space.md }}>
            {env.oauthProviders.includes('google') && (
              <>
                <GoogleButton onPress={() => signInWithProvider('google').catch((e) => setErrors({ _: friendlyAuthError(e) }))} />
                <OrDivider label="or with email" />
              </>
            )}
            <Input label="Your name" value={form.displayName} onChangeText={set('displayName')} placeholder="e.g. Sam Carter" autoComplete="name" icon="person-outline" error={errors.displayName} />
            <Input
              label="Username"
              value={form.username}
              onChangeText={(v) => set('username')(v.replace(/\s/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="e.g. samcarter"
              icon="at"
              onSubmitEditing={next}
              error={errors.username ?? (check.state === 'taken' || check.state === 'invalid' ? check.message : null)}
              hint={check.state === 'available' ? `✓ ${check.message ?? 'Available'}` : check.state === 'checking' ? check.message ?? undefined : 'How friends find you. Letters, numbers and underscores.'}
            />
            <Button title="Continue" size="lg" iconRight="arrow-forward" onPress={next} disabled={check.state === 'checking'} />
          </View>
        </Rise>
      ) : (
        <Rise key="s2">
          <View style={{ gap: space.md }}>
            <Input label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" icon="mail-outline" error={errors.email} />
            <Input label="Password" value={form.password} onChangeText={set('password')} secure placeholder="Create a password" autoComplete="new-password" textContentType="newPassword" icon="lock-closed-outline" error={errors.password} hint={form.password ? undefined : 'At least 8 characters with a letter and a number'} onSubmitEditing={submit} />
            <PasswordStrength value={form.password} />
            {!!errors._ && <Text tone="danger" variant="small" accessibilityRole="alert">{errors._}</Text>}
            <Button title="Create my account" size="lg" iconRight="arrow-forward" loading={busy} onPress={submit} />
            <Button title="Back" variant="ghost" icon="arrow-back" onPress={() => { setErrors({}); setStep(1); }} />
            <Text variant="caption" tone="faint" align="center">
              By creating an account you agree to the{' '}
              <Text variant="caption" tone="primary" onPress={() => router.push('/legal/terms')}>Terms of Use</Text>
              {' '}and{' '}
              <Text variant="caption" tone="primary" onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>.
            </Text>
          </View>
        </Rise>
      )}
    </AuthShell>
  );
}

/** The "check your inbox" moment: an envelope that pops in, with a resend option. */
function CheckInbox({ email }: { email: string }) {
  const { colors, reduceMotion } = useTheme();
  const [pop] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: native }).start();
  }, [pop, reduceMotion]);
  return (
    <AuthShell kicker="You’re in the squad" title="Check your inbox." subtitle={`We sent a link to ${email}. Tap it on this phone and you’ll be signed straight in.`}
      footer={<Button title="Back to sign in" variant="ghost" onPress={() => router.replace({ pathname: '/sign-in', params: { email } })} />}>
      <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
        <Animated.View style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted,
          transform: [{ scale: pop }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] }) }] }}>
          <Ionicons name="mail-unread" size={42} color={colors.primary} />
        </Animated.View>
        <Text variant="small" tone="muted" align="center">Not there in a minute? Check junk, or send it again.</Text>
        <Button title="Resend email" variant="secondary" icon="refresh" onPress={async () => {
          const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } });
          setNote(error ? friendlyAuthError(error) : 'Sent again.');
        }} />
        {!!note && <Text variant="small" tone="muted">{note}</Text>}
      </View>
    </AuthShell>
  );
}
