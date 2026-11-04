import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Header, Input, Screen, Text, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { finishRecovery } from '@/lib/recovery';
import { OpenAppPrompt, isMobileWeb } from '@/features/OpenAppPrompt';
import { passwordSchema } from '@/domain/validation';
import { friendlyAuthError } from '@/features/auth';
import { space } from '@/theme/tokens';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const toast = useToast();
  const submit = async () => {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(friendlyAuthError(e));
    finishRecovery();
    toast.success('Password updated');
    if (isMobileWeb()) {
      const { data } = await supabase.auth.getUser();
      return setDone(data.user?.email ?? '');
    }
    router.replace('/');
  };
  if (done !== null) return <OpenAppPrompt title="Password updated" email={done} message="Open the MATCHDAY app and sign in with your new password." />;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <Header title="Choose a new password" />
      <View style={{ gap: space.lg }}>
        <Input label="New password" value={password} onChangeText={setPassword} secure autoComplete="new-password" />
        <Input label="Confirm password" value={confirm} onChangeText={setConfirm} secure autoComplete="new-password" />
        {!!error && <Text tone="danger" variant="small">{error}</Text>}
        <Button title="Update password" loading={busy} onPress={submit} />
      </View>
    </Screen>
  );
}
