import React from 'react';
import { View } from 'react-native';
import { Avatar, Button, EmptyState, Header, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { keys, useFriends } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { space } from '@/theme/tokens';

export default function Blocked() {
  const friends = useFriends();
  const { run, busy } = useAction([keys.friends]);
  return (
    <Screen edges={['top', 'bottom']} maxWidth={600}>
      <Header title="Blocked players" />
      {!!friends.isLoading && <SkeletonList />}
      {friends.data?.blocked.length === 0 && <EmptyState icon="ban-outline" title="No one blocked" message="Blocked players can’t see you, message you or invite you." />}
      <View style={{ gap: space.md }}>
        {friends.data?.blocked.map((b) => (
          <Row key={b.id} gap={space.md}>
            <Avatar uri={b.avatar_url} name={b.display_name} size={36} />
            <Text style={{ flex: 1 }}>{b.display_name}</Text>
            <Button title="Unblock" size="sm" variant="secondary" loading={busy === b.id} onPress={() => run(b.id, () => rpc('unblock_user', { p_user: b.id }), 'Unblocked')} />
          </Row>
        ))}
      </View>
    </Screen>
  );
}
