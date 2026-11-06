import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, ErrorState, Header, IconButton, Loading, Row, Screen, SectionTitle, Sheet, SwipeSelect, Text } from '@/components/ui';
import { PeoplePicker } from '@/components/football/PeoplePicker';
import { keys, useFriends, useSessionDetail, type PublicProfile } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { q, rpc } from '@/lib/api';
import { useLateStatus } from '@/features/FinesPanel';
import { formatPence } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const detail = useSessionDetail(id);
  const friends = useFriends();
  const { run, busy } = useAction([keys.session(id)]);
  const [adding, setAdding] = useState<{ replacementFor: string | null } | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const d = detail.data;
  const lateStatus = useLateStatus(d?.session.group_id, d?.session.payment_mode !== 'free');
  const members = useQuery({
    queryKey: ['group', d?.session.group_id, 'members-lite'],
    enabled: !!d?.session.group_id,
    queryFn: () => q<any[]>(supabase.from('group_members').select('profile:profiles(id, username, display_name, avatar_url, position)').eq('group_id', d!.session.group_id!)),
  });
  const candidates = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const f of friends.data?.friends ?? []) map.set(f.id, f);
    for (const m of members.data ?? []) if (m.profile) map.set(m.profile.id, m.profile);
    for (const a of d?.attendance ?? []) if (a.status === 'confirmed') map.delete(a.user_id);
    return [...map.values()];
  }, [friends.data, members.data, d]);

  if (detail.isLoading) return <Screen><Header title="Attendance" /><Loading /></Screen>;
  if (!d) return <Screen><Header title="Attendance" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  const s = d.session;
  const locked = s.status === 'finalised' || s.status === 'cancelled';
  const confirmed = d.attendance.filter((a) => a.status === 'confirmed');
  const others = d.attendance.filter((a) => a.status !== 'confirmed');

  const setV = (uid: string, v: 'verified' | 'absent' | 'unverified', late = false) =>
    run(`v-${uid}`, () => rpc('set_attendance_verification', { p_session: id, p_user: uid, p_verification: v, p_late: late }));

  return (
    <Screen edges={['top', 'bottom']} maxWidth={680}>
      <Header title="Attendance" subtitle={`${confirmed.length} confirmed · ${confirmed.filter((a) => a.checked_in_at).length} checked in`} />
      <Card variant="alt">
        <Text variant="small">You have the final say. Only verified players get official stats and can vote. When you complete the session, anyone in a line-up is verified automatically unless you marked them absent.</Text>
        {!!lateStatus.data?.enabled && s.payment_mode !== 'free' && (
          <Text variant="small" tone="warning" style={{ marginTop: space.sm }}>
            Late fines are on in this group: “Arrived late” fines the player (doubling, max {formatPence(lateStatus.data.cap_pence)}). You can waive fines from the group’s Fines tab.
          </Text>
        )}
      </Card>
      {!locked && (
        <Row gap={space.sm} wrap>
          <Button title="Add player" icon="person-add-outline" size="sm" onPress={() => { setPick(new Set()); setAdding({ replacementFor: null }); }} />
        </Row>
      )}
      <SectionTitle title="Confirmed" />
      {confirmed.map((a) => (
        <Card key={a.user_id}>
          <View style={{ gap: space.sm }}>
            <Row gap={space.md}>
              <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{a.profile.display_name}</Text>
                <Row gap={6}>
                  <Ionicons name={a.checked_in_at ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={a.checked_in_at ? colors.primary : colors.textFaint} />
                  <Text variant="caption" tone="muted">{a.checked_in_at ? 'Checked in' : 'Not checked in'}{a.replacement_for ? ' · replacement' : ''}</Text>
                </Row>
              </View>
              {locked && a.verification === 'verified' && <Badge label={a.late_arrival ? 'Played · late' : 'Played'} tone="success" />}
              {locked && a.verification === 'absent' && <Badge label="Absent" tone="danger" />}
              {!locked && <IconButton icon="swap-horizontal" size={34} label={`Replace ${a.profile.display_name}`} onPress={() => { setPick(new Set()); setAdding({ replacementFor: a.user_id }); }} />}
            </Row>
            {!locked && (
              <SwipeSelect accessibilityLabel={`${a.profile.display_name}'s attendance`}
                value={a.verification === 'absent' ? 'absent' : a.verification === 'verified' ? (a.late_arrival ? 'late' : 'played') : 'unmarked'}
                onChange={(v) => (v === 'unmarked' ? setV(a.user_id, 'unverified') : v === 'absent' ? setV(a.user_id, 'absent') : setV(a.user_id, 'verified', v === 'late'))}
                options={[
                  { value: 'unmarked', label: 'Not marked', icon: 'ellipse-outline' },
                  { value: 'played', label: 'Played', icon: 'checkmark-circle-outline' },
                  { value: 'late', label: 'Arrived late', icon: 'time-outline' },
                  { value: 'absent', label: 'Absent', icon: 'close-circle-outline' },
                ]} />
            )}
          </View>
        </Card>
      ))}
      {others.length > 0 && (
        <>
          <SectionTitle title="Others" />
          {others.map((a) => (
            <Row key={a.user_id} gap={space.md}>
              <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={32} />
              <Text style={{ flex: 1 }}>{a.profile.display_name}</Text>
              <Badge label={a.status === 'removed' ? 'removed by host' : a.status} tone={a.status === 'waitlisted' ? 'warning' : a.status === 'removed' ? 'danger' : 'neutral'} align="center" />
              {!locked && <Button title="Add" size="sm" variant="ghost" loading={busy === `add-${a.user_id}`} onPress={() => run(`add-${a.user_id}`, () => rpc('add_session_player', { p_session: id, p_user: a.user_id }), 'Added to the squad')} />}
            </Row>
          ))}
        </>
      )}
      <Sheet visible={!!adding} onClose={() => setAdding(null)} title={adding?.replacementFor ? 'Choose a replacement' : 'Add players'}>
        <PeoplePicker people={candidates} selected={pick} onToggle={(uid) => setPick((p) => {
          const n = adding?.replacementFor ? new Set<string>() : new Set(p);
          if (n.has(uid)) n.delete(uid);
          else n.add(uid);
          return n;
        })} emptyText="No friends or group members available to add." />
        <Button title={adding?.replacementFor ? 'Replace' : `Add ${pick.size || ''}`} disabled={!pick.size} loading={busy === 'adding'} onPress={async () => {
          const ok = await run('adding', async () => {
            for (const uid of pick) await rpc('add_session_player', { p_session: id, p_user: uid, p_replacement_for: adding?.replacementFor ?? null });
          }, adding?.replacementFor ? 'Replacement added and swapped into the line-up' : 'Players added');
          if (ok !== undefined) setAdding(null);
        }} />
      </Sheet>
    </Screen>
  );
}
