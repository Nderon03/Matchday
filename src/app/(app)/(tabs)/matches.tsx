import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ErrorState, Screen, Segmented, SkeletonList, Text } from '@/components/ui';
import { SessionCard } from '@/components/football/SessionCard';
import { useMySessions } from '@/hooks/queries';
import { space } from '@/theme/tokens';

export default function Matches() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const sessions = useMySessions();
  const { upcoming, past } = useMemo(() => {
    const all = sessions.data ?? [];
    const isUpcoming = (s: (typeof all)[number]) => ['scheduled', 'in_progress', 'completed'].includes(s.status);
    return {
      upcoming: all.filter(isUpcoming).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      past: all.filter((s) => !isUpcoming(s)),
    };
  }, [sessions.data]);
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <Screen onRefresh={sessions.refetch} refreshing={sessions.isRefetching}>
      <Text variant="h1" accessibilityRole="header" style={{ paddingTop: space.sm }}>Matches</Text>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: `Upcoming${upcoming.length ? ` · ${upcoming.length}` : ''}` }, { value: 'past', label: 'History' }]} />
      {sessions.isLoading && <SkeletonList rows={5} />}
      {sessions.error && <ErrorState error={sessions.error} onRetry={sessions.refetch} />}
      {sessions.data && list.length === 0 && (
        <EmptyState
          icon={tab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
          title={tab === 'upcoming' ? 'Nothing scheduled' : 'No match history yet'}
          message={tab === 'upcoming' ? 'Create a session or wait for an invite from your squad.' : 'Finalised sessions you played in will appear here.'}
          action={tab === 'upcoming' ? { label: 'Create a session', onPress: () => router.push('/create') } : undefined}
        />
      )}
      <View style={{ gap: space.md }}>
        {list.map((s) => <SessionCard key={s.id} session={s} myStatus={s.my_status} confirmed={s.confirmed_count} groupName={s.group?.name} />)}
      </View>
    </Screen>
  );
}
