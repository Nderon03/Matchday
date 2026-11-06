import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { CardStyle } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';
// where the sparkles sit (percent of the card, round the edges so they never cover text)
const STARS: [number, number, number][] = [
  [3, 4, 10], [93, 3, 12], [95, 46, 9], [2, 52, 9], [94, 91, 11], [50, 1, 8], [24, 95, 8], [70, 96, 9],
];
// Hall of Fame embers: [left %, size, seconds to rise, start delay ms]
const EMBERS: [number, number, number, number][] = [
  [6, 3, 4.2, 0], [15, 2, 5.1, 900], [27, 4, 3.8, 2100], [38, 2, 4.6, 400], [49, 3, 5.4, 1600],
  [58, 2, 4.0, 2800], [67, 4, 4.8, 700], [76, 2, 3.6, 1900], [86, 3, 5.0, 300], [95, 2, 4.4, 2500],
];

/**
 * Animated effects for earned card styles: a light shimmer sweeping across (Bronze+), a glowing
 * edge (Silver+), twinkling stars (Gold+) and, for Hall of Fame only, a slowly turning golden beam,
 * embers rising through the card and a trophy watermark. Base colours stay still. Effects hold
 * still when reduce motion is on.
 */
export function CardFX({ st, radius }: { st: CardStyle; radius: number }) {
  const { reduceMotion } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => STARS.map(() => new Animated.Value(0)));
  const [rise] = useState(() => EMBERS.map(() => new Animated.Value(0)));
  const stars = st.fx >= 4 ? STARS.length : st.id === 'platinum' ? 6 : st.fx >= 3 ? 4 : 0;
  const legend = st.fx >= 4;
  const still = reduceMotion || st.fx === 0;

  useEffect(() => {
    if (still) return;
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: legend ? 1600 : 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.delay(legend ? 1200 : 2600),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      ])),
      ...(st.fx >= 2 ? [Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: legend ? 1000 : 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: legend ? 1000 : 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]))] : []),
      ...twinkle.slice(0, stars).map((t, i) => Animated.loop(Animated.sequence([
        Animated.delay(i * 380),
        Animated.timing(t, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        Animated.delay(1600 - i * 120),
      ]))),
      ...(legend ? [
        Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: native })),
        ...rise.map((r, i) => Animated.loop(Animated.sequence([
          Animated.delay(EMBERS[i][3]),
          Animated.timing(r, { toValue: 1, duration: EMBERS[i][2] * 1000, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: native }),
        ]))),
      ] : []),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, st.fx, legend, stars, sweep, glow, spin, twinkle, rise]);

  if (st.fx === 0) return null;
  const { w, h } = size;
  const band = Math.max(60, w * 0.22);
  const beam = Math.max(w, h) * 1.6;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {legend && w > 0 && (
        <>
          {/* a golden beam turning slowly behind everything */}
          <Animated.View style={{ position: 'absolute', width: beam, height: beam, left: (w - beam) / 2, top: (h - beam) / 2, opacity: 0.22,
            transform: [{ rotate: still ? '30deg' : spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
            <Svg width={beam} height={beam}>
              <Defs>
                <LinearGradient id="hof-beam" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0.3" stopColor={st.accent} stopOpacity="0" />
                  <Stop offset="0.5" stopColor={st.accent} stopOpacity="1" />
                  <Stop offset="0.7" stopColor={st.accent} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect width={beam} height={beam} fill="url(#hof-beam)" />
            </Svg>
          </Animated.View>
          <View style={{ position: 'absolute', right: -18, bottom: -10, opacity: 0.07, transform: [{ rotate: '-12deg' }] }}>
            <Ionicons name="trophy" size={Math.min(170, h * 0.75)} color={st.accent} />
          </View>
          {EMBERS.map(([x, s], i) => (
            <Animated.View key={`e${i}`} style={{ position: 'absolute', left: `${x}%`, top: h - 4, width: s, height: s, borderRadius: s, backgroundColor: st.accent,
              opacity: still ? 0 : rise[i].interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.9, 0.5, 0] }),
              transform: [{ translateY: rise[i].interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.85] }) },
                { translateX: rise[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 6 : -6, 0] }) }] }} />
          ))}
        </>
      )}
      {!still && w > 0 && (
        <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width: band, opacity: legend ? 0.13 : 0.09, backgroundColor: '#FFFFFF',
          transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-band * 2, w + band] }) }, { rotate: '18deg' }] }} />
      )}
      {st.fx >= 2 && !!st.border && (
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: legend ? 3 : 2, borderColor: st.border,
          opacity: still ? 0.6 : glow.interpolate({ inputRange: [0, 1], outputRange: [legend ? 0.45 : 0.25, 1] }) }]} />
      )}
      {STARS.slice(0, stars).map(([x, y, s], i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`,
          opacity: still ? 0.5 : twinkle[i], transform: [{ scale: still ? 1 : twinkle[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }}>
          <Ionicons name="sparkles" size={s} color={st.accent} />
        </Animated.View>
      ))}
    </View>
  );
}
