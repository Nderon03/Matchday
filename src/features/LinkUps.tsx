import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@/components/ui/Ionicons';
import { Avatar, Card, Row, SectionTitle, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { firstName, plural } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export interface LinkUp {
  player: { id: string; username: string; display_name: string; avatar_url: string | null };
  games: number; wins: number; draws: number; losses: number; win_pct: number; lift: number;
}
export interface LinkUps { games: number; win_pct: number; linkups: LinkUp[] }

/** The lift chip: how much more (or less) often you win with this teammate than usual. */
export function Lift({ value }: { value: number }) {
  const { colors } = useTheme();
  const up = value > 0;
  const tone = up ? colors.primary : value < 0 ? colors.textMuted : colors.textFaint;
  return (
    <View accessibilityLabel={value === 0 ? 'Same as usual' : `${Math.abs(value)} percent ${up ? 'better' : 'worse'} than usual`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 20, borderRadius: radius.pill,
        backgroundColor: up ? colors.primaryMuted : colors.surfaceAlt }}>
      {value !== 0 && <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={10} color={tone} />}
      <Text variant="caption" style={{ color: tone, fontVariant: ['tabular-nums'] }}>{value === 0 ? 'even' : `${Math.abs(value)}%`}</Text>
    </View>
  );
}

interface Duo {
  a: LinkUp['player']; b: LinkUp['player'];
  games: number; wins: number; draws: number; losses: number; win_pct: number;
}

/** Best duos in a group: the pairs who win most when they're on the same team. Hidden until there are some. */
export function GroupDuos({ groupId }: { groupId: string }) {
  const { colors } = useTheme();
  const duos = useQuery({ queryKey: ['group', groupId, 'duos'], queryFn: () => rpc<Duo[]>('get_group_duos', { p_group: groupId }) });
  const list = (duos.data ?? []).filter((d) => d?.a && d?.b);
  if (!list.length) return null;
  return (
    <>
      <SectionTitle title="Best duos" />
      <Card padded={false}>
        {list.map((d, i) => {
          const names = `${firstName(d.a.display_name)} & ${firstName(d.b.display_name)}`;
          return (
            <Pressable key={`${d.a.id}${d.b.id}`} onPress={() => router.push({ pathname: '/linkups', params: { user: d.a.id, name: d.a.display_name, group: groupId } })}
              accessibilityRole="button" accessibilityLabel={`${names}: ${d.win_pct} percent wins in ${plural(d.games, 'game')} together`}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
              <Row gap={space.md} style={{ paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 56, height: 36 }}>
                  <View style={{ position: 'absolute', left: 0, borderRadius: 18, backgroundColor: colors.surface }}><Avatar uri={d.a.avatar_url} name={d.a.display_name} size={36} /></View>
                  <View style={{ position: 'absolute', left: 20, top: -2, borderRadius: 20, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface }}>
                    <Avatar uri={d.b.avatar_url} name={d.b.display_name} size={36} />
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{names}</Text>
                  <Text variant="caption" tone="muted">{plural(d.games, 'game')} together · {d.wins}W {d.draws}D {d.losses}L</Text>
                </View>
                <Text variant="statSmall" tone={i === 0 ? 'primary' : 'default'}>{d.win_pct}%</Text>
              </Row>
            </Pressable>
          );
        })}
      </Card>
    </>
  );
}

/** The profile row that opens the full link-ups list: the top three teammates' faces and a one-line summary. */
export function LinkUpsRow({ data, self, name, userId, first }: { data: LinkUps; self: boolean; name: string; userId: string; first: boolean }) {
  const { colors } = useTheme();
  const top = data.linkups.slice(0, 3);
  const best = data.linkups[0];
  return (
    <Pressable onPress={() => router.push({ pathname: '/linkups', params: { user: userId, name } })} accessibilityRole="button"
      accessibilityLabel={`All link-ups: ${plural(data.linkups.length, 'teammate')}`} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row gap={space.md} style={{ padding: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
        <View style={{ width: 44 + (top.length - 1) * 14, height: 44, justifyContent: 'center' }}>
          {top.map((l, i) => (
            <View key={l.player.id} style={{ position: 'absolute', left: i * 14, borderRadius: 16, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface, zIndex: 3 - i }}>
              <Avatar uri={l.player.avatar_url} name={l.player.display_name} size={28} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="primary">Link-ups</Text>
          <Text variant="bodyStrong" numberOfLines={1}>{plural(data.linkups.length, 'teammate')} ranked</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {self ? 'Best with' : `${firstName(name, 'They')}’s best:`} {firstName(best.player.display_name)}, {best.win_pct}% wins together
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Row>
    </Pressable>
  );
}
