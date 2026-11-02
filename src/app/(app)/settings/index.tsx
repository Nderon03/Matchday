import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Divider, Header, Input, ListItem, Screen, SectionTitle, Segmented, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { keys, usePreferences } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { invoke } from '@/lib/api';
import { space } from '@/theme/tokens';
import type { ProfileVisibility } from '@/types/db';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/** Version line: app version plus which over-the-air update is running (handy when checking an update arrived). */
function versionLabel() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  if (Platform.OS === 'web') return `MATCHDAY v${version} · web`;
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) return `MATCHDAY v${version} · ${Platform.OS} · original build`;
  const when = Updates.createdAt ? ` · ${Updates.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${Updates.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';
  return `MATCHDAY v${version} · ${Platform.OS} · update ${Updates.updateId.slice(0, 8)}${when}`;
}

export default function Settings() {
  const { signOut, userId, session } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const prefs = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const setVisibility = async (v: ProfileVisibility) => {
    const { error } = await supabase.from('user_preferences').update({ profile_visibility: v, show_stats: v !== 'private' }).eq('user_id', userId!);
    if (error) return toast.error(error);
    qc.invalidateQueries({ queryKey: keys.prefs });
    toast.success('Privacy updated');
  };

  const icon = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={colors.textMuted} />;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="Settings" subtitle={session?.user.email} />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem title="Edit profile" subtitle="Photo, name, username, position, bio" left={icon('person-circle-outline')} onPress={() => router.push('/settings/profile')} />
        <Divider />
        <ListItem title="Notifications" subtitle="Push, email and what you hear about" left={icon('notifications-outline')} onPress={() => router.push('/settings/notifications')} />
        <Divider />
        <ListItem title="Payouts" subtitle="Receive session fees with Stripe" left={icon('wallet-outline')} onPress={() => router.push('/settings/payouts')} />
        <Divider />
        <ListItem title="Payment history" left={icon('receipt-outline')} onPress={() => router.push('/payments')} />
        <Divider />
        <ListItem title="Blocked players" left={icon('ban-outline')} onPress={() => router.push('/settings/blocked')} />
      </Card>

      <SectionTitle title="Privacy" />
      <Card>
        <View style={{ gap: space.sm }}>
          <Text variant="small" tone="muted">Who can see your statistics, achievements and bio? Group members always see your record within that group.</Text>
          {!!prefs.data && (
            <Segmented value={prefs.data.profile_visibility} onChange={setVisibility} options={[{ value: 'public', label: 'Everyone' }, { value: 'friends', label: 'Friends' }, { value: 'private', label: 'Only me' }]} />
          )}
        </View>
      </Card>

      <SectionTitle title="Appearance" />
      <Segmented value={preference} onChange={setPreference} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />

      <SectionTitle title="Account" />
      <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={signOut} />
      <Button title="Delete account" variant="danger" icon="trash-outline" onPress={() => setDeleteOpen(true)} />
      <Text variant="caption" tone="faint" align="center">{versionLabel()}</Text>

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account">
        <Text tone="muted">This permanently deletes your profile, friends, statistics and notifications. Groups you own are handed to another admin. This cannot be undone.</Text>
        <Input label='Type DELETE to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
        <Button title="Delete permanently" variant="danger" disabled={confirm !== 'DELETE'} loading={busy} onPress={async () => {
          setBusy(true);
          try {
            await invoke('delete-account', { confirm: 'DELETE' });
            await supabase.auth.signOut();
            qc.clear();
            router.replace('/welcome');
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }} />
      </Sheet>
    </Screen>
  );
}
