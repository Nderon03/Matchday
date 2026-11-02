import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Sheet, Text } from '@/components/ui';
import { keys, useNotifications } from '@/hooks/queries';
import { rpc } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Shows a clear in-app notice when the host removes you from a session — immediately via
 * realtime if you're in the app, otherwise the next time you open it. Dismissing marks the
 * notification as read (it stays in your notifications list).
 */
export function KickedNotice() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const notifications = useNotifications();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const notice = notifications.data?.find((n) => (n.type === 'session_removed' || n.type === 'group_removed') && !n.read_at && !dismissed.has(n.id));
  if (!notice) return null;
  const isGroup = notice.type === 'group_removed';

  const close = async (thenOpen: boolean) => {
    setDismissed((s) => new Set(s).add(notice.id));
    await rpc('mark_notifications_read', { p_ids: [notice.id] }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: keys.notifications });
    if (thenOpen && notice.data.session_id) router.push(`/session/${notice.data.session_id}`);
    else if (thenOpen && notice.data.group_id) router.push(`/group/${notice.data.group_id}`);
  };

  return (
    <Sheet visible onClose={() => close(false)} title={isGroup ? 'Removed from a group' : 'Removed from a session'}>
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.dangerMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person-remove" size={26} color={colors.danger} />
        </View>
        <Text variant="h3" align="center">
          {isGroup ? `An admin removed you from ${notice.data.group_name ?? 'a group'}` : `The host removed you from ${notice.data.session_name ?? 'a session'}`}
        </Text>
        {notice.data.reason ? <Text align="center">Reason: {notice.data.reason}</Text> : null}
        <Text variant="small" tone="muted" align="center">
          {isGroup ? 'You can only rejoin if an admin adds you back. Your stats are kept.' : 'You can only rejoin if the host invites you again.'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="OK" variant="secondary" style={{ flex: 1 }} onPress={() => close(false)} />
        {!isGroup && <Button title="View session" style={{ flex: 1 }} onPress={() => close(true)} />}
      </View>
    </Sheet>
  );
}
