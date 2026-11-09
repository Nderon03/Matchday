import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Avatar, Card, Row, Text, useToast } from '@/components/ui';
import { timeAgo, plural } from '@/domain/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { FeedItem as FeedRow } from '@/hooks/queries';

export function describeActivity(item: FeedRow): { icon: keyof typeof Ionicons.glyphMap; text: string } {
  const p = item.payload ?? {};
  const who = item.actor?.display_name ?? 'Someone';
  switch (item.type) {
    case 'session_result': return { icon: 'football', text: `${p.session_name}: full time ${p.score}` };
    case 'motm': return { icon: 'star', text: `${who} ${p.shared ? 'shared' : 'won'} Man of the Match in ${p.session_name} (${plural(p.votes, 'vote')})` };
    case 'hat_trick': return { icon: 'flame', text: `${who} scored a hat-trick (${p.goals} goals) in ${p.session_name}` };
    case 'achievement': return { icon: 'ribbon', text: `${who} unlocked “${p.name}”` };
    case 'season_started': return { icon: 'calendar', text: `${p.group_name} started ${p.season_name}` };
    case 'season_award': return { icon: 'trophy', text: `${who} won ${String(p.award).replace(/_/g, ' ')} in ${p.season_name}` };
    case 'group_milestone': return { icon: 'sparkles', text: `${p.group_name} completed its ${p.sessions}th session!` };
    case 'group_created': return { icon: 'people', text: `${who} created ${p.group_name}` };
    case 'leader_change': return { icon: 'trending-up', text: `${who} is the new ${p.category} leader` };
    default: return { icon: 'flash', text: `${who} was active` };
  }
}

// reactions are stored by name; shown as our own icons
const EMOJI: Record<string, keyof typeof Ionicons.glyphMap> = { like: 'thumbs-up', fire: 'flame', goal: 'football', clap: 'sparkles' };

export function FeedItemCard({ item, showComments = true }: { item: FeedRow; showComments?: boolean }) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const d = describeActivity(item);
  const counts = Object.keys(EMOJI).map((e) => ({ e, n: item.reactions.filter((r) => r.emoji === e).length, mine: item.reactions.some((r) => r.emoji === e && r.user_id === userId) }));

  const toggle = async (emoji: string, mine: boolean) => {
    const res = mine
      ? await supabase.from('reactions').delete().match({ activity_id: item.id, user_id: userId, emoji })
      : await supabase.from('reactions').insert({ activity_id: item.id, user_id: userId, emoji });
    if (res.error) toast.error(res.error);
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  return (
    <Card>
      <View style={{ gap: space.md }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          {item.actor ? <Avatar uri={item.actor.avatar_url} name={item.actor.display_name} size={40} /> : (
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={d.icon} size={20} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body">{d.text}</Text>
            <Row gap={6}>
              <Ionicons name={d.icon} size={13} color={colors.primary} />
              <Text variant="caption" tone="faint">{item.group?.name ? `${item.group.name} · ` : ''}{timeAgo(item.created_at)}</Text>
            </Row>
          </View>
        </Row>
        <Row gap={space.xs} wrap>
          {counts.map(({ e, n, mine }) => (
            <Pressable key={e} onPress={() => toggle(e, mine)} accessibilityRole="button" accessibilityLabel={`${e} reaction, ${n}`} accessibilityState={{ selected: mine }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: mine ? colors.primaryMuted : colors.surfaceAlt, borderWidth: 1, borderColor: mine ? colors.primary : 'transparent' }}>
              <Ionicons name={EMOJI[e]} size={15} color={mine ? colors.primary : e === 'fire' ? '#F97316' : colors.textMuted} />
              {n > 0 && <Text variant="caption" tone={mine ? 'primary' : 'muted'}>{n}</Text>}
            </Pressable>
          ))}
          {!!showComments && (
            <Pressable onPress={() => router.push(`/feed/${item.id}`)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, marginLeft: 'auto' }}>
              <Ionicons name="chatbubble-outline" size={15} color={colors.textMuted} />
              <Text variant="caption" tone="muted">{item.comments?.[0]?.count ?? 0}</Text>
            </Pressable>
          )}
        </Row>
      </View>
    </Card>
  );
}
