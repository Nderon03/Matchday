import React, { useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/**
 * How my position changed since I last looked at this exact table (positive = moved up).
 * Remembers the new position straight away, so the change shows once.
 */
export function useRankChange(tableKey: string, rank: number | null | undefined) {
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (rank == null) return;
    let alive = true;
    const key = `matchday.rank.${tableKey}`;
    AsyncStorage.getItem(key).then((prev) => {
      if (!alive) return;
      const before = prev ? Number(prev) : null;
      setDelta(before && before !== rank ? before - rank : 0);
      AsyncStorage.setItem(key, String(rank)).catch(() => undefined);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [tableKey, rank]);
  return delta;
}

/** "▲ Up 2" (green) or "▼ Down 1" (quiet), popping in next to my row. */
export function RankChangePill({ delta }: { delta: number }) {
  const { colors, reduceMotion } = useTheme();
  const [pop] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (!delta || reduceMotion) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 110, delay: 400, useNativeDriver: native }).start();
  }, [delta, pop, reduceMotion]);
  if (!delta) return null;
  const up = delta > 0;
  const tone = up ? colors.success : colors.textMuted;
  return (
    <Animated.View accessible accessibilityLabel={`${up ? 'Up' : 'Down'} ${Math.abs(delta)} since you last looked`}
      style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [up ? 8 : -8, 0] }) }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: `${tone}22` }}>
        <Ionicons name={up ? 'caret-up' : 'caret-down'} size={11} color={tone} />
        <Text variant="caption" style={{ color: tone, fontWeight: '700' }}>{up ? 'Up' : 'Down'} {Math.abs(delta)}</Text>
      </View>
    </Animated.View>
  );
}
