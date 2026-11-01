import React from 'react';
import { View } from 'react-native';
import { EmptyState, ErrorState, Header, Screen, SkeletonList } from '@/components/ui';
import { TaskCard } from '@/components/football/TaskCard';
import { useTasks } from '@/hooks/queries';
import { space } from '@/theme/tokens';

export default function Tasks() {
  const tasks = useTasks();
  return (
    <Screen edges={['top', 'bottom']} onRefresh={tasks.refetch} refreshing={tasks.isRefetching}>
      <Header title="To do" subtitle="Finish these before your next game" />
      {!!tasks.isLoading && <SkeletonList />}
      {!!tasks.error && <ErrorState error={tasks.error} onRetry={tasks.refetch} />}
      {tasks.data?.length === 0 && <EmptyState icon="checkmark-done-outline" title="Nothing outstanding" message="Votes, goal submissions, payments and approvals will show up here." />}
      <View style={{ gap: space.sm }}>
        {tasks.data?.map((t, i) => <TaskCard key={`${t.kind}-${t.session_id}-${i}`} task={t} />)}
      </View>
    </Screen>
  );
}
