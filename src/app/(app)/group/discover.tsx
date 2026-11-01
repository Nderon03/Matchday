import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Header, Input, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { q, rpc } from '@/lib/api';
import { useAction } from '@/hooks/useAction';
import { space } from '@/theme/tokens';

export default function Discover() {
  const [search, setSearch] = useState('');
  const groups = useQuery({
    queryKey: ['groups', 'discover', search],
    queryFn: () => {
      let query = supabase.from('groups').select('*, group_members(count)').eq('visibility', 'public').order('created_at', { ascending: false }).limit(50);
      if (search.trim().length >= 2) query = query.or(`name.ilike.%${search.trim()}%,location.ilike.%${search.trim()}%`);
      return q<any[]>(query);
    },
  });
  const { run, busy } = useAction([['groups']]);
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Discover groups" />
      <Input placeholder="Search by name or area" value={search} onChangeText={setSearch} icon="search" />
      {groups.isLoading && <SkeletonList />}
      {groups.error && <ErrorState error={groups.error} onRetry={groups.refetch} />}
      {groups.data?.length === 0 && <EmptyState icon="compass-outline" title="No public groups found" message="Try another search, or create your own group." />}
      {groups.data?.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/group/${g.id}`)}>
          <Row gap={space.md}>
            <Avatar uri={g.logo_url} name={g.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{g.name}</Text>
              <Text variant="small" tone="muted">{g.group_members?.[0]?.count ?? 0} members{g.location ? ` · ${g.location}` : ''}</Text>
            </View>
            {g.join_policy === 'invite_only' ? <Badge label="Invite only" /> : (
              <Button title={g.join_policy === 'open' ? 'Join' : 'Request'} size="sm" loading={busy === g.id}
                onPress={() => run(g.id, () => rpc<string>('join_group', { p_group: g.id }), (r) => (r === 'joined' ? 'Welcome to the group!' : r === 'already_member' ? 'You’re already a member' : 'Request sent to the admins'))} />
            )}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
