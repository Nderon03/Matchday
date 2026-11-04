import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { GroupJoinPolicy, GroupVisibility } from '@/types/db';

/** One plain choice instead of separate visibility + join policy settings. */
export type GroupAccess = 'invite' | 'approval' | 'open';

export const GROUP_ACCESS: { value: GroupAccess; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'invite', title: 'Invite only', icon: 'lock-closed-outline',
    detail: 'Hidden from Discover. People join with an invite link or QR code shared by a member, or an admin adds them. Best for your regular mates.' },
  { value: 'approval', title: 'Ask to join', icon: 'hand-left-outline',
    detail: 'Listed in Discover. Anyone can send a request and an admin approves or declines it.' },
  { value: 'open', title: 'Open', icon: 'globe-outline',
    detail: 'Listed in Discover. Anyone can join straight away, no approval needed.' },
];

export function accessToSettings(a: GroupAccess): { visibility: GroupVisibility; join_policy: GroupJoinPolicy } {
  if (a === 'open') return { visibility: 'public', join_policy: 'open' };
  if (a === 'approval') return { visibility: 'public', join_policy: 'request' };
  return { visibility: 'private', join_policy: 'request' };
}

export function accessOf(g: { visibility: GroupVisibility; join_policy: GroupJoinPolicy }): GroupAccess {
  if (g.visibility === 'private' || g.join_policy === 'invite_only') return 'invite';
  return g.join_policy === 'open' ? 'open' : 'approval';
}

export function GroupAccessPicker({ value, onChange }: { value: GroupAccess; onChange: (a: GroupAccess) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
      {GROUP_ACCESS.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ checked: selected }}
            style={{ flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryMuted : colors.surface }}>
            <Ionicons name={o.icon} size={22} color={selected ? colors.primary : colors.textMuted} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{o.title}</Text>
              <Text variant="small" tone="muted">{o.detail}</Text>
            </View>
            <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.textFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}
