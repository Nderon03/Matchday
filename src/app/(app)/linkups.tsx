import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, Chip, EmptyState, Header, QueryView, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useMyGroups } from '@/hooks/queries';
import { firstName, plural } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Lift, safeLinkUps, type LinkUps } from '@/features/LinkUps';

/** Every teammate a player has shared at least 3 games with, ranked by how often they win together. */
export default function LinkUpsScreen() {
  const { user: userParam, name, group: groupParam } = useLocalSearchParams<{ user?: string; name?: string; group?: string }>();
  const { userId } = useAuth();
  const { colors } = useTheme();
  const user = userParam ?? userId!;
  const self = user === userId;
  const [group, setGroup] = useState<string | undefined>(groupParam);
  const groups = useMyGroups();
  const query = useQuery({
    queryKey: ['player', user, 'linkups', group ?? 'all'],
    enabled: !!user,
    queryFn: () => rpc<LinkUps | null>('get_player_linkups', { p_user: user, p_group: group ?? null }),
    select: safeLinkUps,
  });
  const who = self ? 'You' : firstName(name, 'They');

  return (
    <Screen>
      <Header title="Link-ups" subtitle={self ? 'Who you win most with' : `Who ${who} wins most with`} />
      {self && (groups.data?.length ?? 0) > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingBottom: space.md }}>
          <Chip label="All games" selected={!group} onPress={() => setGroup(undefined)} />
          {groups.data!.map((g: any) => <Chip key={g.id} label={g.name} selected={group === g.id} onPress={() => setGroup(g.id)} />)}
        </ScrollView>
      )}
      <QueryView query={query} skeleton={<SkeletonList rows={5} />}>
        {(d) => !d ? (
          <EmptyState icon="lock-closed-outline" title="Link-ups are private" message={`${who} only share${self ? '' : 's'} stats with friends.`} />
        ) : d.linkups.length === 0 ? (
          <EmptyState icon="people-outline" title="No link-ups yet"
            message={`Link-ups appear once ${self ? 'you’ve' : `${who} has`} played 3 games on the same team as someone.`} />
        ) : (
          <View style={{ gap: space.md }}>
            <Text variant="small" tone="muted">
              {self ? 'You win' : `${who} wins`} {d.win_pct}% of {plural(d.games, 'game')} overall. The arrow shows how much better or worse that is with each teammate.
            </Text>
            <Card padded={false}>
              {d.linkups.map((l, i) => (
                <Pressable key={l.player.id} onPress={() => router.push(`/player/${l.player.id}`)} accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${l.player.display_name}: ${l.win_pct} percent wins in ${plural(l.games, 'game')} together`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
                  <Row gap={space.md} style={{ paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Text variant="smallStrong" tone={i === 0 ? 'primary' : 'faint'} style={{ width: 16, textAlign: 'center' }}>{i + 1}</Text>
                    <Avatar uri={l.player.avatar_url} name={l.player.display_name} size={38} />
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{l.player.display_name}</Text>
                      <Row gap={6}>
                        <Text variant="caption" tone="muted">{plural(l.games, 'game')} · {l.wins}W {l.draws}D {l.losses}L</Text>
                      </Row>
                      <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                        <View style={{ width: `${l.win_pct}%`, height: 4, borderRadius: radius.pill, backgroundColor: i === 0 ? colors.primary : colors.borderStrong }} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text variant="statSmall" tone={i === 0 ? 'primary' : 'default'}>{l.win_pct}%</Text>
                      <Lift value={l.lift} />
                    </View>
                  </Row>
                </Pressable>
              ))}
            </Card>
          </View>
        )}
      </QueryView>
    </Screen>
  );
}
