import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';
import { useLayout } from '@/hooks/useLayout';

export function StatTile({ label, value, sub, accent, compact }: { label: string; value: string | number; sub?: string; accent?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}
      style={{ flex: 1, minWidth: 0, padding: compact ? space.md : space.lg, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, gap: 2 }}
    >
      <Text variant={compact ? 'statSmall' : 'stat'} tone={accent ? 'primary' : 'default'}>{value}</Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>{label}</Text>
      {sub && <Text variant="caption" tone="faint" numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

/** Even grid of stat tiles: 3 columns on phones, 5 on wider screens. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const { isWide } = useLayout();
  const cols = isWide ? 5 : 3;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs }}>
      {React.Children.toArray(children).map((child, i) => (
        <View key={i} style={{ width: `${100 / cols}%`, padding: space.xs, flexDirection: 'row' }}>{child}</View>
      ))}
    </View>
  );
}

export function Badge({ label, tone = 'neutral', align = 'flex-start' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary'; align?: 'flex-start' | 'center' | 'auto' }) {
  const { colors } = useTheme();
  const map = {
    neutral: [colors.elevated, colors.textMuted],
    success: [colors.primaryMuted, colors.success],
    primary: [colors.primaryMuted, colors.primary],
    warning: [colors.warningMuted, colors.warning],
    danger: [colors.dangerMuted, colors.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: 'center', alignSelf: align }}>
      <Text variant="caption" color={fg} numberOfLines={1}>{label}</Text>
    </View>
  );
}
