import React from 'react';
import { Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Divider, Header, Loading, Row, Screen, SectionTitle, Text, useToast } from '@/components/ui';
import { keys, usePreferences } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { registerForPush } from '@/lib/notifications';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const TYPES: [string, string, string][] = [
  ['session_invite', 'Session invitations', 'When someone invites you to play'],
  ['session_reminder', 'Kick-off reminders', '24 hours before a game you’re in'],
  ['lineup_announced', 'Line-ups announced', 'When the host confirms teams'],
  ['waitlist_promoted', 'Waiting list', 'When a space opens up for you'],
  ['players_needed', 'Games needing players', 'When a game near you or a friend’s game is short'],
  ['waitlist_offer', 'Last-minute places', 'On the day: a place is yours if you take it within 30 minutes'],
  ['spot_open', 'Unfilled places (hosts)', 'When nobody on the waiting list takes a free place'],
  ['host_summary', 'Weekly summary (hosts)', 'Monday morning: who’s in, who hasn’t replied, what’s unpaid'],
  ['dropout_request', 'Drop-outs (hosts)', 'When a player can’t make it after the 24-hour cut-off'],
  ['voting_open', 'Voting open', 'After full time'],
  ['voting_reminder', 'Voting reminders', 'Before voting closes'],
  ['goals_reminder', 'Goal reminders', 'If you forget to submit goals'],
  ['goals_awaiting_approval', 'Goals to approve (hosts)', 'When players submit goals'],
  ['payment_required', 'Payment requests', 'When a session fee is due'],
  ['session_finalised', 'Results', 'When results and MOTM are published'],
  ['session_video', 'Match videos', 'When the host adds a video of a game'],
  ['achievement_unlocked', 'Achievements', 'When you unlock something new'],
  ['friend_request', 'Friend requests', 'New requests and acceptances'],
  ['group_invite', 'Group invitations', 'When someone invites you to a group'],
  ['moderation_report', 'Reports (group admins)', 'When something in your group is reported'],
  ['season_started', 'Seasons', 'New seasons and awards in your groups'],
];

export default function NotificationSettings() {
  const { userId } = useAuth();
  const { colors } = useTheme();
  const prefs = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  if (!prefs.data) return <Screen><Header title="Notifications" /><Loading /></Screen>;
  const p = prefs.data;
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from('user_preferences').update(patch).eq('user_id', userId!);
    if (error) toast.error(error);
    qc.invalidateQueries({ queryKey: keys.prefs });
  };
  const toggle = (type: string, on: boolean) => update({ notification_prefs: { ...p.notification_prefs, [type]: on } });

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="Notifications" />
      <Card>
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><Text variant="bodyStrong">Push notifications</Text><Text variant="caption" tone="muted">On this device</Text></View>
            <Switch value={p.push_enabled} onValueChange={(v) => update({ push_enabled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
          </Row>
          <Button title="Re-register this device" size="sm" variant="ghost" onPress={async () => {
            const r = await registerForPush().catch(() => 'denied' as const);
            toast.show(r === 'registered' ? 'Push enabled on this device' : r === 'denied' ? 'Allow notifications in system settings' : 'Push is not available on this platform/build');
          }} />
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><Text variant="bodyStrong">Email</Text><Text variant="caption" tone="muted">Invites and payments only</Text></View>
            <Switch value={p.email_enabled} onValueChange={(v) => update({ email_enabled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
          </Row>
        </View>
      </Card>
      <SectionTitle title="What you hear about" />
      <Card padded={false}>
        {TYPES.map(([key, label, sub], i) => (
          <Row key={key} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><Text variant="bodyStrong">{label}</Text><Text variant="caption" tone="muted">{sub}</Text></View>
            <Switch value={p.notification_prefs[key] !== false} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel={label} />
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
