import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Chip, Header, Input, Screen, Text, useToast } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useUsernameCheck } from '@/hooks/useUsernameCheck';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/api';
import { pickAndUpload } from '@/lib/storage';
import { fieldErrors, profileSchema } from '@/domain/validation';
import { POSITION_LABEL } from '@/domain/format';
import { space } from '@/theme/tokens';
import type { PlayerPosition } from '@/types/db';

export default function EditProfile() {
  const { profile, userId, refreshProfile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [position, setPosition] = useState<PlayerPosition>(profile?.position ?? 'ANY');
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const check = useUsernameCheck(username, profile?.username);

  const save = async () => {
    const parsed = profileSchema.safeParse({ display_name: displayName, bio, position });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      if (username !== profile?.username) await rpc('complete_onboarding', { p_username: username, p_display_name: displayName, p_position: position });
      const { error } = await supabase.from('profiles').update({ display_name: displayName.trim(), bio: bio.trim() || null, position }).eq('id', userId!);
      if (error) throw error;
      await refreshProfile();
      qc.invalidateQueries({ queryKey: ['player', userId] });
      toast.success('Profile saved');
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={560}>
      <Header title="Edit profile" />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar uri={avatar} name={displayName} size={96} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Change photo" size="sm" variant="secondary" icon="camera-outline" onPress={async () => {
            try {
              const url = await pickAndUpload('avatars', userId!);
              if (!url) return;
              const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId!);
              if (error) throw error;
              setAvatar(url);
              refreshProfile();
            } catch (e) { toast.error(e); }
          }} />
          {!!avatar && <Button title="Remove" size="sm" variant="ghost" onPress={async () => {
            await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId!);
            setAvatar(null);
            refreshProfile();
          }} />}
        </View>
      </View>
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} error={errors.display_name} maxLength={40} />
      <Input label="Username" value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, ''))} autoCapitalize="none" icon="at"
        error={check.state === 'taken' || check.state === 'invalid' ? check.message : null} hint={check.message ?? undefined} />
      <Input label="Bio" value={bio} onChangeText={setBio} multiline maxLength={280} error={errors.bio} placeholder="e.g. Left foot only. Always up for a game." />
      <Text variant="smallStrong" tone="muted">Preferred position</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {(['GK', 'DEF', 'MID', 'FWD', 'ANY'] as PlayerPosition[]).map((p) => <Chip key={p} label={POSITION_LABEL[p]} selected={position === p} onPress={() => setPosition(p)} />)}
      </View>
      <Button title="Save" size="lg" loading={busy} disabled={check.state === 'taken' || check.state === 'invalid'} onPress={save} />
    </Screen>
  );
}
