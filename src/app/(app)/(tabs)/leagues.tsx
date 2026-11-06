import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Row, Screen, Segmented, SkeletonList, SwipeSelect, Text } from '@/components/ui';
import { Leaderboard } from '@/components/football/Leaderboard';
import { useMyGroups } from '@/hooks/queries';
import { GroupInvites } from '@/features/GroupInvites';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { plural } from '@/domain/format';

export default function Leagues() {
  const { colors } = useTheme();
  const groups = useMyGroups();
  const [tab, setTab] = useState<'groups' | 'tables'>('groups');
  const [scope, setScope] = useState<string>('friends');

  return (
    <Screen onRefresh={groups.refetch} refreshing={groups.isRefetching}>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }}>
        <Text variant="h1" accessibilityRole="header">Leagues</Text>
        <Button title="Discover" icon="compass-outline" size="sm" variant="secondary" onPress={() => router.push('/group/discover')} />
      </Row>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'groups', label: 'My groups' }, { value: 'tables', label: 'Leaderboards' }]} />

      {tab === 'groups' && (
        <View style={{ gap: space.md }}>
          <GroupInvites />
          {!!groups.isLoading && <SkeletonList />}
          {!!groups.error && <ErrorState error={groups.error} onRetry={groups.refetch} />}
          {groups.data?.length === 0 && (
            <EmptyState icon="people-outline" title="No groups yet" message="Groups keep your regular squad’s fixtures, tables, seasons and awards in one place."
              action={{ label: 'Create a group', onPress: () => router.push('/group/new') }} />
          )}
          {groups.data?.map((g) => (
            <Card key={g.id} onPress={() => router.push(`/group/${g.id}`)} accessibilityLabel={g.name}>
              <Row gap={space.md}>
                <Avatar uri={g.logo_url} name={g.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text variant="h3" numberOfLines={1}>{g.name}</Text>
                  <Text variant="small" tone="muted">{plural(g.member_count, 'member')}{g.location ? ` · ${g.location}` : ''}</Text>
                </View>
                {g.role !== 'member' && <Badge label={g.role} tone="primary" />}
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Row>
            </Card>
          ))}
          {!!groups.data?.length && <Button title="Create a group" icon="add" variant="ghost" onPress={() => router.push('/group/new')} />}
        </View>
      )}

      {tab === 'tables' && (
        <View style={{ gap: space.md }}>
          <SwipeSelect label="Table" value={scope} onChange={setScope} options={[
            { value: 'friends', label: 'Friends', icon: 'people-outline' },
            { value: 'global', label: 'Everyone', icon: 'globe-outline' },
            ...(groups.data ?? []).map((g) => ({ value: g.id, label: g.name, icon: 'shield-outline' as const })),
          ]} />
          {scope === 'friends' || scope === 'global'
            ? <Leaderboard key={scope} scope={scope} />
            : <Leaderboard key={scope} scope="group" groupId={scope} />}
        </View>
      )}
    </Screen>
  );
}
