import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';

export function Segmented<T extends string>({ options, value, onChange, scroll }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  const content = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(o.value)}
        style={[styles.item, scroll ? { paddingHorizontal: space.lg } : { flex: 1 }, active && { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}
      >
        <Text variant="smallStrong" tone={active ? 'default' : 'muted'} numberOfLines={1}>{o.label}</Text>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.wrap, { backgroundColor: colors.surfaceAlt }]}>
        {content}
      </ScrollView>
    );
  }
  return <View style={[styles.wrap, { backgroundColor: colors.surfaceAlt }]}>{content}</View>;
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryMuted : colors.surface }]}
    >
      {icon}
      <Text variant="smallStrong" tone={selected ? 'primary' : 'muted'}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3, borderRadius: radius.md, gap: 2 },
  item: { height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 },
});
