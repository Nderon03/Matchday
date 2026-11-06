import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Card, Text } from '@/components/ui';
import { timeUntil } from '@/domain/format';
import type { Task } from '@/hooks/queries';

const META: Record<string, { icon: keyof typeof Ionicons.glyphMap; route: (id: string) => string; tone: 'primary' | 'warning' | 'danger' }> = {
  rsvp: { icon: 'mail-unread', route: (id) => `/session/${id}`, tone: 'warning' },
  vote: { icon: 'star', route: (id) => `/session/${id}/vote`, tone: 'primary' },
  goals: { icon: 'football', route: (id) => `/session/${id}/goals`, tone: 'primary' },
  payment: { icon: 'card', route: (id) => `/session/${id}/payments`, tone: 'danger' },
  approve_goals: { icon: 'checkmark-done', route: (id) => `/session/${id}/goals`, tone: 'warning' },
  complete: { icon: 'flag', route: (id) => `/session/${id}/results`, tone: 'warning' },
  finalise: { icon: 'lock-closed', route: (id) => `/session/${id}`, tone: 'warning' },
};

export function TaskCard({ task }: { task: Task }) {
  const { colors } = useTheme();
  const m = META[task.kind] ?? META.rsvp;
  const tint = m.tone === 'primary' ? colors.primary : m.tone === 'danger' ? colors.danger : colors.warning;
  return (
    <Card onPress={() => router.push(m.route(task.session_id) as any)} accessibilityLabel={`${task.subtitle}: ${task.title}`} style={{ borderColor: `${tint}55` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={m.icon} size={20} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={2}>{task.subtitle}</Text>
          <Text variant="small" tone="muted" numberOfLines={2}>
            {task.title}{!!task.due_at && ['vote', 'goals'].includes(task.kind) ? ` · closes in ${timeUntil(task.due_at)}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </View>
    </Card>
  );
}
