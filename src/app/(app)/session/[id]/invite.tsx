import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, Header, Loading, Screen, SectionTitle, Text } from '@/components/ui';
import { PeoplePicker } from '@/components/football/PeoplePicker';
import { InviteQr } from '@/components/football/InviteQr';
import { keys, useFriends, useSessionDetail, type PublicProfile } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { q, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import { toggleIn } from '@/domain/sets';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useSessionDetail(id);
  const friends = useFriends();
  const { run, busy } = useAction([keys.session(id)]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const d = detail.data;
  const members = useQuery({
    queryKey: ['group', d?.session.group_id, 'members-lite'],
    enabled: !!d?.session.group_id,
    queryFn: () => q<any[]>(supabase.from('group_members').select('profile:profiles(id, username, display_name, avatar_url, position)').eq('group_id', d!.session.group_id!)),
  });
  const already = useMemo(() => new Set([...(d?.invited ?? []).map((p) => p.id), ...(d?.attendance ?? []).map((a) => a.user_id)]), [d]);
  const people = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const f of friends.data?.friends ?? []) map.set(f.id, f);
    for (const m of members.data ?? []) if (m.profile) map.set(m.profile.id, m.profile);
    if (d?.session.host_id) map.delete(d.session.host_id);
    return [...map.values()].sort((a, b) => Number(already.has(a.id)) - Number(already.has(b.id)) || a.display_name.localeCompare(b.display_name));
  }, [friends.data, members.data, d, already]);

  if (detail.isLoading) return <Screen><Header title="Invite" /><Loading /></Screen>;
  if (!d) return <Screen><Header title="Invite" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}
      footer={<Button title={`Send ${pick.size} invite${pick.size === 1 ? '' : 's'}`} size="lg" disabled={!pick.size} loading={busy === 'send'}
        onPress={async () => {
          const ok = await run('send', () => rpc<number>('invite_to_session', { p_session: id, p_users: [...pick] }), (n) => `${n} invited`);
          if (ok !== undefined) setPick(new Set());
        }} />}>
      <Header title="Invite players" subtitle={d.session.name} />
      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="bodyStrong">Share a link</Text>
          <Text variant="small" tone="muted">Anyone with the link can join the invite list (expires in 7 days).</Text>
          <InviteQr kind="session" targetId={id} message={`Join ${d.session.name} on MATCHDAY`} />
        </View>
      </Card>
      <SectionTitle title="Friends & group members" />
      <PeoplePicker people={people} selected={pick} disabledIds={already} onToggle={(uid) => setPick((p) => toggleIn(p, uid))} />
    </Screen>
  );
}
