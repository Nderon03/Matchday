import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, ErrorState, Loading, Screen, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { formatKickoff } from '@/domain/format';
import { space } from '@/theme/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Deep-link landing for friend / group / session invites (also the QR target). */
export default function InviteLanding() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, initialising } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const invite = useQuery({ queryKey: ['invite', code], enabled: !!session, queryFn: () => rpc<any>('get_invite', { p_code: code }) });

  useEffect(() => {
    if (!initialising && !session) {
      AsyncStorage.setItem('matchday.pendingInvite', code).catch(() => undefined);
    }
  }, [initialising, session, code]);

  if (initialising) return <Screen><Loading /></Screen>;
  if (!session) {
    return (
      <Screen edges={['top', 'bottom']} maxWidth={480}>
        <View style={{ gap: space.lg, paddingTop: space.huge }}>
          <Text variant="overline" tone="primary">MATCHDAY</Text>
          <Text variant="h1">You’ve been invited</Text>
          <Text tone="muted">Sign in or create an account to accept. We’ll bring you straight back here.</Text>
          <Button title="Create account" size="lg" onPress={() => router.push('/sign-up')} />
          <Button title="Sign in" variant="secondary" size="lg" onPress={() => router.push('/sign-in')} />
        </View>
      </Screen>
    );
  }
  if (invite.isLoading) return <Screen><Loading /></Screen>;
  if (!invite.data) return <Screen><ErrorState error={invite.error} onRetry={invite.refetch} /></Screen>;
  const d = invite.data;
  if (!d.valid) {
    return (
      <Screen edges={['top', 'bottom']} maxWidth={480}>
        <View style={{ gap: space.md, paddingTop: space.huge }}>
          <Text variant="h2">Invitation expired</Text>
          <Text tone="muted">{d.reason === 'expired' ? 'This invite link has expired.' : 'This invite link is no longer valid.'} Ask for a new one.</Text>
          <Button title="Go home" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }
  const p = d.preview ?? {};
  const accept = async () => {
    setBusy(true);
    try {
      const r = await rpc<any>('accept_invite', { p_code: code });
      await AsyncStorage.removeItem('matchday.pendingInvite').catch(() => undefined);
      if (r.kind === 'group') router.replace(`/group/${r.target_id}`);
      else if (r.kind === 'session') router.replace(`/session/${r.target_id}`);
      else { toast.success('You’re now friends'); router.replace(`/player/${r.target_id}`); }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <View style={{ gap: space.lg, paddingTop: space.huge }}>
        <Text variant="overline" tone="primary">{d.kind === 'friend' ? 'Friend invite' : d.kind === 'group' ? 'Group invite' : 'Session invite'}</Text>
        <Card>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <Avatar uri={p.avatar_url ?? p.logo_url} name={p.display_name ?? p.name} size={72} />
            <Text variant="h2" align="center">{p.display_name ?? p.name}</Text>
            {d.kind === 'friend' && <Text tone="muted">@{p.username}</Text>}
            {d.kind === 'group' && <Text tone="muted">{p.members} members</Text>}
            {d.kind === 'session' && <Text tone="muted">{p.format_size}-a-side · {formatKickoff(p.starts_at)}{p.venue ? ` · ${p.venue}` : ''}</Text>}
          </View>
        </Card>
        <Button title={d.kind === 'friend' ? 'Add friend' : d.kind === 'group' ? 'Join group' : 'Accept invite'} size="lg" loading={busy} onPress={accept} />
        <Button title="Not now" variant="ghost" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
