import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Row, SectionTitle, Text } from '@/components/ui';
import { keys } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

interface Invite { group_id: string; name: string; logo_url: string | null; location: string | null; members: number; invited_by: string | null; created_at: string }

export function useGroupInvites() {
  const { userId } = useAuth();
  useRealtimeInvalidate('group-invites', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], [['group-invites']], !!userId);
  return useQuery({ queryKey: ['group-invites'], queryFn: () => rpc<Invite[]>('get_my_group_invites'), enabled: !!userId });
}

/** Groups you've been invited to: accept to join, or decline. */
export function GroupInvites() {
  const invites = useGroupInvites();
  const qc = useQueryClient();
  const { run, busy } = useAction([['group-invites'], keys.groups]);
  if (!invites.data?.length) return null;
  const respond = (g: Invite, accept: boolean) => run(`inv-${g.group_id}-${accept}`, async () => {
    const r = await rpc<string>('respond_group_invite', { p_group: g.group_id, p_accept: accept });
    if (accept) {
      haptics.success();
      qc.invalidateQueries({ queryKey: keys.groups });
      router.push(`/group/${g.group_id}`);
    }
    return r;
  }, accept ? `Welcome to ${g.name}` : 'Invitation declined');
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle title={`Invitations · ${invites.data.length}`} />
      {invites.data.map((g) => (
        <Card key={g.group_id} variant="highlight">
          <View style={{ gap: space.md }}>
            <Row gap={space.md}>
              <Avatar uri={g.logo_url} name={g.name} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="h3" numberOfLines={1}>{g.name}</Text>
                <Text variant="small" tone="muted">
                  {g.invited_by ? `${g.invited_by} invited you · ` : ''}{g.members} member{g.members === 1 ? '' : 's'}{g.location ? ` · ${g.location}` : ''}
                </Text>
              </View>
            </Row>
            <Row gap={space.sm}>
              <Button title="Join group" icon="checkmark" style={{ flex: 1 }} loading={busy === `inv-${g.group_id}-true`} onPress={() => respond(g, true)} />
              <Button title="Decline" variant="secondary" style={{ flex: 1 }} loading={busy === `inv-${g.group_id}-false`} onPress={() => respond(g, false)} />
            </Row>
          </View>
        </Card>
      ))}
    </View>
  );
}
