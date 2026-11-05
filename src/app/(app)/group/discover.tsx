import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Header, Input, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { useAction } from '@/hooks/useAction';
import { space } from '@/theme/tokens';

export default function Discover() {
  const [search, setSearch] = useState('');
  const groups = useQuery({
    queryKey: ['groups', 'discover', search],
    // every word is matched separately, in any order (name, area or description)
    queryFn: () => rpc<any[]>('search_public_groups', { p_query: search.trim() || null, p_limit: 50 }),
  });
  const { run, busy } = useAction([['groups']]);
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Discover groups" />
      <Input placeholder="Search by name or area, e.g. Mill Hill" value={search} onChangeText={setSearch} icon="search" />
      <Text variant="caption" tone="muted">Groups set to “Ask to join” or “Open”. Invite-only groups are private and don’t appear here.</Text>
      {!!groups.isLoading && <SkeletonList />}
      {!!groups.error && <ErrorState error={groups.error} onRetry={groups.refetch} />}
      {groups.data?.length === 0 && <EmptyState icon="compass-outline" title="No public groups found" message="Try another search, or create your own group." />}
      {groups.data?.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/group/${g.id}`)}>
          <Row gap={space.md}>
            <Avatar uri={g.logo_url} name={g.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{g.name}</Text>
              <Text variant="small" tone="muted">{g.members ?? 0} members{g.location ? ` · ${g.location}` : ''}</Text>
            </View>
            {g.join_policy === 'invite_only' ? <Badge label="Invite only" /> : (
              <Button title={g.join_policy === 'open' ? 'Join' : 'Ask to join'} size="sm" loading={busy === g.id}
                onPress={async () => {
                  const r = await run(g.id, () => rpc<string>('join_group', { p_group: g.id }), (x) => (x === 'joined' ? '' : x === 'already_member' ? 'You’re already a member' : 'Request sent to the admins'));
                  if (r === 'joined' || r === 'already_member') router.push(`/group/${g.id}`);
                }} />
            )}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
