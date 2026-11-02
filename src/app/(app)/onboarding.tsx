import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, Chip, Input, Screen, Text, useToast } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { rpc } from '@/lib/api';
import { pickAndUpload } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useUsernameCheck } from '@/hooks/useUsernameCheck';
import { POSITION_LABEL } from '@/domain/format';
import { space } from '@/theme/tokens';
import type { PlayerPosition } from '@/types/db';
import { TermsCheckbox } from '@/features/LegalAgreement';
import { LEGAL_VERSION } from '@/legal/content';

export default function Onboarding() {
  const { profile, userId, refreshProfile } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [position, setPosition] = useState<PlayerPosition>(profile?.position ?? 'ANY');
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const check = useUsernameCheck(username, profile?.username);

  useEffect(() => {
    if (profile?.onboarded) router.replace('/');
  }, [profile?.onboarded]);

  const upload = async () => {
    try {
      const url = await pickAndUpload('avatars', userId!);
      if (url) {
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId!);
        setAvatar(url);
      }
    } catch (e) {
      toast.error(e);
    }
  };

  const finish = async () => {
    if (!displayName.trim()) return toast.show('Add a display name', 'error');
    if (!agreed) return toast.show('Please agree to the Terms of Use and Privacy Policy', 'error');
    setBusy(true);
    try {
      await rpc('complete_onboarding', { p_username: username, p_display_name: displayName, p_position: position, p_accept_terms: agreed, p_terms_version: LEGAL_VERSION });
      await refreshProfile();
      router.replace('/');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={520}>
      <View style={{ gap: space.xs, paddingTop: space.xl }}>
        <Text variant="overline" tone="primary">Step 1 of 1</Text>
        <Text variant="h1">Set up your player profile</Text>
        <Text tone="muted">This is how your squad will see you on line-ups and leaderboards.</Text>
      </View>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar uri={avatar} name={displayName || username} size={96} />
        <Button title={avatar ? 'Change photo' : 'Add a photo'} variant="ghost" size="sm" icon="camera-outline" onPress={upload} />
      </View>
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
      <Input
        label="Username"
        value={username}
        onChangeText={(v) => setUsername(v.replace(/\s/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        icon="at"
        error={check.state === 'taken' || check.state === 'invalid' ? check.message : null}
        hint={check.message ?? undefined}
      />
      <View style={{ gap: space.sm }}>
        <Text variant="smallStrong" tone="muted">Preferred position</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(['GK', 'DEF', 'MID', 'FWD', 'ANY'] as PlayerPosition[]).map((p) => (
            <Chip key={p} label={POSITION_LABEL[p]} selected={position === p} onPress={() => setPosition(p)} />
          ))}
        </View>
      </View>
      <TermsCheckbox checked={agreed} onChange={setAgreed} />
      <Button title="Let’s play" size="lg" loading={busy} disabled={!agreed || check.state === 'taken' || check.state === 'invalid' || check.state === 'checking'} onPress={finish} />
    </Screen>
  );
}
