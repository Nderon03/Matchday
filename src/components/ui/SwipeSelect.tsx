import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';

const native = Platform.OS !== 'web';

export interface SwipeOption<T> { value: T; label: string; detail?: string; icon?: keyof typeof Ionicons.glyphMap }

/**
 * One tidy control instead of a row of buttons: shows the current choice; swipe left/right or tap
 * the arrows to change it. Dots show where you are; an optional line explains the current choice.
 */
export function SwipeSelect<T extends string | number | null>({ label, options, value, onChange, compact, accessibilityLabel, dots = true }: {
  label?: string;
  options: SwipeOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** smaller, for putting two side by side */
  compact?: boolean;
  accessibilityLabel?: string;
  /** the position dots under the control (off for small inline use) */
  dots?: boolean;
}) {
  const { colors, reduceMotion } = useTheme();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];
  const [slide] = useState(() => new Animated.Value(0));
  // where a swipe started (set and read only in touch handlers)
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (dir: 1 | -1) => {
    const next = index + dir;
    if (next < 0 || next >= options.length) return;
    haptics.tap();
    onChange(options[next].value);
    if (!reduceMotion) {
      slide.setValue(dir * 24);
      Animated.timing(slide, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    }
  };
  useEffect(() => () => slide.stopAnimation(), [slide]);

  const arrow = (dir: 1 | -1) => {
    const disabled = dir < 0 ? index === 0 : index === options.length - 1;
    return (
      <Pressable onPress={() => go(dir)} disabled={disabled} hitSlop={10} accessibilityRole="button"
        accessibilityLabel={dir < 0 ? 'Previous option' : 'Next option'}
        style={({ pressed }) => ({ width: compact ? 30 : 36, height: compact ? 30 : 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
          backgroundColor: pressed ? colors.elevated : 'transparent', opacity: disabled ? 0.25 : 1 })}>
        <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={compact ? 18 : 20} color={colors.text} />
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space.xs, flex: compact ? 1 : undefined }}>
      {!!label && <Text variant="smallStrong" tone="muted">{label}</Text>}
      <View
        onTouchStart={(e) => { touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.nativeEvent.pageX - start.x;
          const dy = e.nativeEvent.pageY - start.y;
          if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
        accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel ?? label} accessibilityValue={{ text: current?.label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: compact ? 46 : 52, paddingHorizontal: 6,
          borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}>
        {arrow(-1)}
        <Animated.View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
          opacity: slide.interpolate({ inputRange: [-24, 0, 24], outputRange: [0.2, 1, 0.2] }), transform: [{ translateX: slide }] }}>
          {!!current?.icon && <Ionicons name={current.icon} size={compact ? 15 : 17} color={colors.primary} />}
          <Text variant={compact ? 'smallStrong' : 'bodyStrong'} numberOfLines={1}>{current?.label}</Text>
        </Animated.View>
        {arrow(1)}
      </View>
      {dots && options.length > 1 && options.length <= 12 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          {options.map((o, i) => (
            <View key={String(o.value)} style={{ width: i === index ? 12 : 4, height: 4, borderRadius: 2, backgroundColor: i === index ? colors.primary : colors.borderStrong }} />
          ))}
        </View>
      )}
      {!!current?.detail && <Text variant="caption" tone="muted">{current.detail}</Text>}
    </View>
  );
}
