import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, Header, Screen, SkeletonList, Text } from '@/components/ui';
import { keys, useNotifications } from '@/hooks/queries';
import { rpc } from '@/lib/api';
import { routeForNotification } from '@/lib/notifications';
import { timeAgo } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  friend_request: 'person-add', friend_accepted: 'people', session_invite: 'mail', session_reminder: 'alarm', attendance_confirmed: 'checkmark-circle',
  waitlist_promoted: 'arrow-up-circle', lineup_announced: 'shirt', payment_required: 'card', payment_confirmed: 'card', payment_failed: 'alert-circle',
  session_finalised: 'flag', goals_awaiting_approval: 'football', goals_reviewed: 'football', goals_submit: 'football', voting_open: 'star',
  voting_reminder: 'star', achievement_unlocked: 'ribbon', season_started: 'calendar', season_award: 'trophy', session_cancelled: 'close-circle',
};

export default function Notifications() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const n = useNotifications();
  const unread = n.data?.filter((x) => !x.read_at).length ?? 0;
  const markAll = async () => {
    await rpc('mark_notifications_read', { p_ids: null }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: keys.notifications });
    qc.invalidateQueries({ queryKey: keys.home });
  };
  useEffect(() => {
    // opening the inbox clears the badge after a short delay
    if (!unread) return;
    const t = setTimeout(markAll, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <Screen edges={['top', 'bottom']} onRefresh={n.refetch} refreshing={n.isRefetching}>
      <Header title="Notifications" right={unread ? <Button title="Mark all read" size="sm" variant="ghost" onPress={markAll} /> : undefined} />
      {n.isLoading && <SkeletonList />}
      {n.error && <ErrorState error={n.error} onRetry={n.refetch} />}
      {n.data?.length === 0 && <EmptyState icon="notifications-outline" title="You’re all caught up" message="Invites, results, votes and payments will appear here." />}
      <View style={{ gap: 2 }}>
        {n.data?.map((item) => {
          const route = routeForNotification({ ...item.data, type: item.type });
          return (
            <Pressable key={item.id} onPress={() => route && router.push(route as any)} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: !item.read_at ? colors.primaryMuted : pressed ? colors.surfaceAlt : 'transparent' })}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={ICON[item.type] ?? 'notifications'} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{item.title}</Text>
                {!!item.body && <Text variant="small" tone="muted">{item.body}</Text>}
                <Text variant="caption" tone="faint">{timeAgo(item.created_at)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
