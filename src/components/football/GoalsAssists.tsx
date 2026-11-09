import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/** Goals and assists as our own icons (the same ones as the Goals and Assists medals), not emojis. */
export function GoalsAssists({ goals, assists, size = 14, color, strong = false, showZero = false }: {
  goals?: number; assists?: number; size?: number; color?: string; strong?: boolean; showZero?: boolean;
}) {
  const { colors } = useTheme();
  const c = color ?? colors.textMuted;
  const item = (n: number | undefined, icon: 'football' | 'git-merge', label: string) =>
    n || (showZero && n === 0) ? (
      <View accessible accessibilityLabel={`${n} ${label}${n === 1 ? '' : 's'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text variant={strong ? 'bodyStrong' : 'small'} color={strong ? undefined : c}>{n}</Text>
        <Ionicons name={icon} size={size} color={c} />
      </View>
    ) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {item(goals, 'football', 'goal')}
      {item(assists, 'git-merge', 'assist')}
    </View>
  );
}
