import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/**
 * "9/10 confirmed" with a bar that fills up. The number pops when it changes, and when the last
 * place is taken the bar turns gold with "Squad complete" (and a buzz if it filled while watching).
 */
export function SquadMeter({ confirmed, max, label }: { confirmed: number; max: number; label: string }) {
  const { colors, reduceMotion } = useTheme();
  const full = confirmed >= max;
  const pct = Math.min(1, max ? confirmed / max : 0);
  const [fill] = useState(() => new Animated.Value(reduceMotion ? pct : 0));
  const [bump] = useState(() => new Animated.Value(1));
  const [badge] = useState(() => new Animated.Value(full ? 1 : 0));
  const prev = useRef(confirmed);

  useEffect(() => {
    if (reduceMotion) { fill.setValue(pct); badge.setValue(full ? 1 : 0); return; }
    Animated.timing(fill, { toValue: pct, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    if (prev.current !== confirmed) {
      bump.setValue(1.25);
      Animated.spring(bump, { toValue: 1, friction: 4, tension: 120, useNativeDriver: native }).start();
      if (full && prev.current < max) haptics.success();
    }
    Animated.spring(badge, { toValue: full ? 1 : 0, friction: 5, tension: 90, useNativeDriver: native }).start();
    prev.current = confirmed;
  }, [confirmed, max, pct, full, fill, bump, badge, reduceMotion]);

  const tint = full ? colors.gold : colors.primary;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="people-outline" size={17} color={colors.textMuted} />
        <Animated.Text style={{ transform: [{ scale: bump }], color: colors.text, fontWeight: '700', fontSize: 15 }}>{confirmed}/{max}</Animated.Text>
        <Text style={{ flex: 1 }} numberOfLines={2}>{label}</Text>
        <Animated.View style={{ opacity: badge, transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${colors.gold}22` }}
          accessibilityElementsHidden={!full}>
          <Ionicons name="sparkles" size={12} color={colors.gold} />
          <Text variant="caption" style={{ color: colors.gold, fontWeight: '700' }}>Squad complete</Text>
        </Animated.View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginLeft: 25 }}>
        <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: tint, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
    </View>
  );
}
