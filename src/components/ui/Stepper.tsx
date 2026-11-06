import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';

/** Large +/- control for quick score and goal entry. */
export function Stepper({ value, onChange, min = 0, max = 99, label, size = 'md' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; size?: 'sm' | 'md' | 'lg';
}) {
  const { colors } = useTheme();
  const btn = size === 'lg' ? 52 : size === 'sm' ? 30 : 40;
  const change = (d: number) => {
    const next = Math.min(max, Math.max(min, value + d));
    if (next !== value) {
      haptics.tap();
      onChange(next);
    }
  };
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: size === 'sm' ? space.sm : space.md }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => change(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <Pressable onPress={() => change(-1)} disabled={value <= min} hitSlop={6} style={{ width: btn, height: btn, borderRadius: radius.md, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center', opacity: value <= min ? 0.4 : 1 }}>
        <Ionicons name="remove" size={size === 'sm' ? 16 : 22} color={colors.text} />
      </Pressable>
      <Text variant={size === 'lg' ? 'display' : size === 'sm' ? 'bodyStrong' : 'stat'} style={{ minWidth: size === 'lg' ? 56 : size === 'sm' ? 24 : 40, textAlign: 'center' }}>{value}</Text>
      <Pressable onPress={() => change(1)} disabled={value >= max} hitSlop={6} style={{ width: btn, height: btn, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', opacity: value >= max ? 0.4 : 1 }}>
        <Ionicons name="add" size={size === 'sm' ? 16 : 22} color={colors.primary} />
      </Pressable>
    </View>
  );
}
