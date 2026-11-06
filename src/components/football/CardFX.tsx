import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CardStyle } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';
// where the sparkles sit (percent of the card, round the edges so they never cover text)
const STARS: [number, number, number][] = [
  [3, 4, 10], [93, 3, 12], [95, 46, 9], [2, 52, 9], [94, 91, 11], [50, 1, 8], [24, 95, 8], [70, 96, 9],
];

/**
 * Animated effects for earned card styles: a light shimmer sweeping across (Bronze+), a glowing
 * edge (Silver+) and twinkling stars (Gold+). Base colours stay still. Off when reduce motion is on.
 */
export function CardFX({ st, radius }: { st: CardStyle; radius: number }) {
  const { reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => STARS.map(() => new Animated.Value(0)));
  const stars = st.fx >= 4 ? STARS.length : st.id === 'platinum' ? 6 : st.fx >= 3 ? 4 : 0;
  const still = reduceMotion || st.fx === 0;

  useEffect(() => {
    if (still) return;
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: st.fx >= 4 ? 1800 : 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.delay(st.fx >= 4 ? 1400 : 2600),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      ])),
      ...(st.fx >= 2 ? [Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]))] : []),
      ...twinkle.slice(0, stars).map((t, i) => Animated.loop(Animated.sequence([
        Animated.delay(i * 380),
        Animated.timing(t, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        Animated.delay(1600 - i * 120),
      ]))),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, st.fx, stars, sweep, glow, twinkle]);

  if (st.fx === 0) return null;
  const band = Math.max(60, width * 0.22);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {!still && width > 0 && (
        <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width: band, opacity: 0.09, backgroundColor: '#FFFFFF',
          transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-band * 2, width + band] }) }, { rotate: '18deg' }] }} />
      )}
      {st.fx >= 2 && !!st.border && (
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 2, borderColor: st.border,
          opacity: still ? 0.6 : glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.95] }) }]} />
      )}
      {STARS.slice(0, stars).map(([x, y, size], i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`,
          opacity: still ? 0.5 : twinkle[i], transform: [{ scale: still ? 1 : twinkle[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }}>
          <Ionicons name="sparkles" size={size} color={st.accent} />
        </Animated.View>
      ))}
    </View>
  );
}
