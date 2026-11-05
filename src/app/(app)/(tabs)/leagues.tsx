import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, Chip, EmptyState, ErrorState, Row, Screen, Segmented, SkeletonList, Text } from '@/components/ui';
import { Leaderboard } from '@/components/football/Leaderboard';
import { useMyGroups } from '@/hooks/queries';
import { GroupInvites } from '@/features/GroupInvites';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

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
                  <Text variant="small" tone="muted">{g.member_count} members{g.location ? ` · ${g.location}` : ''}</Text>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Chip label="Friends" selected={scope === 'friends'} onPress={() => setScope('friends')} />
            <Chip label="Global" selected={scope === 'global'} onPress={() => setScope('global')} />
            {groups.data?.map((g) => <Chip key={g.id} label={g.name} selected={scope === g.id} onPress={() => setScope(g.id)} />)}
          </ScrollView>
          {scope === 'friends' || scope === 'global'
            ? <Leaderboard key={scope} scope={scope} />
            : <Leaderboard key={scope} scope="group" groupId={scope} />}
        </View>
      )}
    </Screen>
  );
}
