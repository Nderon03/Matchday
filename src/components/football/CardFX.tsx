import React, { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { CardStyle } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';
// glints round the edges (percent of the card), so they never cover text: [left, top, size]
const GLINTS: [number, number, number][] = [
  [3, 5, 12], [92, 3, 14], [95, 44, 10], [2, 50, 10], [96, 24, 9], [52, 1.5, 9], [22, 94, 10], [74, 95, 11],
];
// Hall of Fame embers: [left %, size, seconds to rise, start delay ms]
const EMBERS: [number, number, number, number][] = [
  [6, 3, 4.2, 0], [15, 2, 5.1, 900], [27, 4, 3.8, 2100], [38, 2, 4.6, 400], [49, 3, 5.4, 1600],
  [58, 2, 4.0, 2800], [67, 4, 4.8, 700], [76, 2, 3.6, 1900], [86, 3, 5.0, 300], [95, 2, 4.4, 2500],
];
const RAINBOW = ['#FF6EC7', '#FDE68A', '#86EFAC', '#67E8F9', '#A78BFA', '#FF6EC7'];

/**
 * Each earned style has its own design, and each tier is a clear step up from the one below:
 *  Bronze        brushed copper lines, simple corner brackets, a soft sheen. Still.
 *  Silver        clean steel pinstripes, cut (chamfered) corners, a fine inner frame. Still.
 *  Gold          a sunburst behind your photo, laurel corners, a double gold frame. Still.
 *  Platinum      a hexagon lattice, a rainbow holographic sweep, a breathing frosted edge. Animated.
 *  Diamond       diamond-cut facets, a prism halo turning behind your photo, glints, a rainbow edge. Animated.
 *  Hall of Fame  a golden spotlight turning, embers rising, a crown and trophy, a double gold frame. Animated, the most.
 */
export function CardFX({ st, radius, still: frozen }: { st: CardStyle; radius: number; still?: boolean }) {
  const { reduceMotion } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tier = st.id;
  const animated = st.fx >= 4;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => GLINTS.map(() => new Animated.Value(0)));
  const [rise] = useState(() => EMBERS.map(() => new Animated.Value(0)));
  const still = reduceMotion || !animated || !!frozen;

  useEffect(() => {
    if (still) return;
    const glints = tier === 'diamond' ? 8 : tier === 'hall_of_fame' ? 6 : tier === 'platinum' ? 4 : 0;
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: tier === 'platinum' ? 2200 : 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.delay(tier === 'platinum' ? 2400 : 1600),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: tier === 'hall_of_fame' ? 1000 : 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: tier === 'hall_of_fame' ? 1000 : 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ])),
      ...twinkle.slice(0, glints).map((t, i) => Animated.loop(Animated.sequence([
        Animated.delay(i * 330),
        Animated.timing(t, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: 750, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        Animated.delay(1500 - i * 110),
      ]))),
      ...(tier === 'diamond' || tier === 'hall_of_fame'
        ? [Animated.loop(Animated.timing(spin, { toValue: 1, duration: tier === 'diamond' ? 12000 : 9000, easing: Easing.linear, useNativeDriver: native }))] : []),
      ...(tier === 'hall_of_fame' ? rise.map((r, i) => Animated.loop(Animated.sequence([
        Animated.delay(EMBERS[i][3]),
        Animated.timing(r, { toValue: 1, duration: EMBERS[i][2] * 1000, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: native }),
      ]))) : []),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, tier, sweep, glow, spin, twinkle, rise]);

  if (st.base || !['bronze', 'silver', 'gold', 'platinum', 'diamond', 'hall_of_fame'].includes(tier)) return null;
  const { w, h } = size;
  const id = (n: string) => `${n}${uid}`;
  const big = Math.max(w, h) * 1.6;
  // the photo sits roughly here on the card (gold's sunburst and diamond's halo centre on it)
  const cx = w * 0.4;
  const cy = h * 0.32;
  const pulse = (lo: number) => (still ? (lo + 1) / 2 : glow.interpolate({ inputRange: [0, 1], outputRange: [lo, 1] }));
  const rotate = () => (still ? '20deg' : spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }));
  const band = Math.max(60, w * 0.22);

  const frame = (inset: number, colour: string, width = 1) => (
    <View style={{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: Math.max(4, radius - inset), borderWidth: width, borderColor: colour }} />
  );
  const corners = (render: (flipX: boolean, flipY: boolean) => React.ReactNode, inset = 7, opacity: number | Animated.AnimatedInterpolation<number> = 0.95) =>
    ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([fx, fy]) => (
      <Animated.View key={`${fx}${fy}`} style={{ position: 'absolute', [fx ? 'right' : 'left']: inset, [fy ? 'bottom' : 'top']: inset, opacity,
        transform: [{ scaleX: fx ? -1 : 1 }, { scaleY: fy ? -1 : 1 }] }}>
        {render(!!fx, !!fy)}
      </Animated.View>
    ));
  const glint = (i: number, colour: string) => {
    const [x, y, s] = GLINTS[i];
    return (
      <Animated.View key={`g${i}`} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, opacity: still ? 0.6 : twinkle[i],
        transform: [{ scale: still ? 1 : twinkle[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) }, { rotate: '0deg' }] }}>
        <Svg width={s} height={s} viewBox="0 0 20 20"><Path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill={colour} /></Svg>
      </Animated.View>
    );
  };
  const sweepBand = (kind: 'white' | 'holo' | 'flash', opacity: number, width = band) => !still && (
    <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width, opacity,
      transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 2, w + width] }) }, { rotate: '18deg' }] }}>
      {kind === 'holo' ? (
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id('holo')} x1="0" y1="0" x2="1" y2="0">
              {[
                <Stop key="a" offset="0" stopColor={RAINBOW[0]} stopOpacity="0" />,
                ...RAINBOW.slice(0, 5).map((c, i) => <Stop key={c} offset={String(0.15 + i * 0.175)} stopColor={c} />),
                <Stop key="z" offset="1" stopColor={RAINBOW[4]} stopOpacity="0" />,
              ]}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id('holo')})`} />
        </Svg>
      ) : <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />}
    </Animated.View>
  );

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {w > 0 && (
        <>
          {/* ---------- BRONZE: brushed copper, brackets, a soft sheen ---------- */}
          {tier === 'bronze' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill} opacity={0.11}>
                {Array.from({ length: Math.ceil((w + h) / 6) }, (_, i) => (
                  <Line key={i} x1={i * 6} y1={0} x2={i * 6 - h} y2={h} stroke={st.accent} strokeWidth={0.6} />
                ))}
              </Svg>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0.25" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="0.4" stopColor="#FFD9B8" stopOpacity="0.09" />
                    <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('sheen')})`} />
              </Svg>
              {corners(() => <View style={{ width: 14, height: 14, borderColor: st.border!, borderTopWidth: 2, borderLeftWidth: 2 }} />)}
            </>
          )}

          {/* ---------- SILVER: clean steel pinstripes, cut corners, inner frame ---------- */}
          {tier === 'silver' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill} opacity={0.08}>
                {Array.from({ length: Math.ceil(h / 4) }, (_, i) => (
                  <Line key={i} x1={0} y1={i * 4} x2={w} y2={i * 4} stroke={st.accent} strokeWidth={0.5} />
                ))}
              </Svg>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id={id('steel')} x1="0" y1="0" x2="1" y2="0.6">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
                    <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.05" />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('steel')})`} />
              </Svg>
              {frame(6, `${st.accent}40`)}
              {corners(() => (
                <Svg width={18} height={18}>
                  <Path d="M1 10 L10 1" stroke={st.border!} strokeWidth={2} />
                  <Path d="M1 16 L1 10 M10 1 L16 1" stroke={st.border!} strokeWidth={1.2} />
                </Svg>
              ), 4)}
            </>
          )}

          {/* ---------- GOLD: sunburst behind the photo, laurels, double frame ---------- */}
          {tier === 'gold' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                  <RadialGradient id={id('aura')} cx={cx} cy={cy} r={Math.max(w, h) * 0.55} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={st.accent} stopOpacity="0.22" />
                    <Stop offset="1" stopColor={st.accent} stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('aura')})`} />
                <G opacity={0.11}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const a = (i / 24) * Math.PI * 2;
                    const a2 = a + Math.PI / 48;
                    const r = Math.max(w, h) * 1.2;
                    return <Path key={i} fill={st.accent} d={`M${cx} ${cy} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r} L${cx + Math.cos(a2) * r} ${cy + Math.sin(a2) * r} Z`} />;
                  })}
                </G>
              </Svg>
              {frame(5, `${st.accent}66`)}
              {corners(() => (
                <Svg width={26} height={26} viewBox="0 0 26 26">
                  {/* a laurel sprig curling out of the corner */}
                  <Path d="M2 24 Q4 8 22 2" stroke={st.accent} strokeWidth={1.4} fill="none" />
                  {[[6, 16, -60], [9, 10, -45], [14, 6, -30], [19, 3.5, -15]].map(([x, y, r], i) => (
                    <Ellipse key={i} cx={x} cy={y} rx={3.4} ry={1.5} fill={st.accent} transform={`rotate(${r} ${x} ${y})`} />
                  ))}
                  <Circle cx={2.5} cy={23.5} r={1.8} fill={st.accent} />
                </Svg>
              ), 4)}
            </>
          )}

          {/* ---------- PLATINUM: hexagon lattice, holographic sweep, breathing frost ---------- */}
          {tier === 'platinum' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill} opacity={0.13}>
                <Defs>
                  <Pattern id={id('hex')} patternUnits="userSpaceOnUse" width={24} height={41.6}>
                    <Path d="M12 0 L24 6.9 L24 20.8 L12 27.7 L0 20.8 L0 6.9 Z M12 27.7 L12 41.6" stroke={st.accent} strokeWidth={0.8} fill="none" />
                  </Pattern>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('hex')})`} />
              </Svg>
              {sweepBand('holo', 0.22, band * 1.6)}
              <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 2, borderColor: st.border!, opacity: pulse(0.2) }]} />
              {frame(6, `${st.accent}33`)}
              {corners(() => (
                <Svg width={14} height={14} viewBox="0 0 14 14"><Path d="M7 0 L14 7 L7 14 L0 7 Z" fill={st.accent} /><Path d="M7 3 L11 7 L7 11 L3 7 Z" fill="#FFFFFF" opacity={0.7} /></Svg>
              ), 6, pulse(0.55))}
              {[0, 1, 2, 3].map((i) => glint(i, '#FFFFFF'))}
            </>
          )}

          {/* ---------- DIAMOND: diamond-cut facets, prism halo, glints, rainbow edge ---------- */}
          {tier === 'diamond' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill} opacity={0.16}>
                <Defs>
                  <LinearGradient id={id('facet')} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#C7D2FE" />
                    <Stop offset="1" stopColor="#67E8F9" />
                  </LinearGradient>
                  <Pattern id={id('cut')} patternUnits="userSpaceOnUse" width={28} height={28}>
                    <Path d="M14 0 L28 14 L14 28 L0 14 Z M0 0 L14 14 L28 0 M0 28 L14 14 L28 28" stroke={`url(#${id('facet')})`} strokeWidth={0.7} fill="none" />
                  </Pattern>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('cut')})`} />
              </Svg>
              {sweepBand('flash', 0.16, band * 0.6)}
              {/* rainbow edge, breathing */}
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse(0.45) }]}>
                <Svg width={w} height={h}>
                  <Defs>
                    <LinearGradient id={id('edge')} x1="0" y1="0" x2="1" y2="1">
                      {RAINBOW.map((c, i) => <Stop key={i} offset={String(i / (RAINBOW.length - 1))} stopColor={c} />)}
                    </LinearGradient>
                  </Defs>
                  <Rect x={1.5} y={1.5} width={w - 3} height={h - 3} rx={radius - 1} stroke={`url(#${id('edge')})`} strokeWidth={3} fill="none" />
                </Svg>
              </Animated.View>
              {frame(7, `${st.accent}30`)}
              {corners(() => (
                <Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M8 0 L16 8 L8 16 L0 8 Z" fill="#E0E7FF" /><Path d="M8 0 L8 16 M0 8 L16 8" stroke="#6366F1" strokeWidth={0.8} /></Svg>
              ), 7)}
              {GLINTS.map((_, i) => glint(i, i % 3 === 0 ? '#A5F3FC' : '#FFFFFF'))}
            </>
          )}

          {/* ---------- HALL OF FAME: golden spotlight, embers, crown, trophy, double frame ---------- */}
          {tier === 'hall_of_fame' && (
            <>
              <Animated.View style={{ position: 'absolute', width: big, height: big, left: (w - big) / 2, top: (h - big) / 2, opacity: 0.24, transform: [{ rotate: rotate() }] }}>
                <Svg width={big} height={big}>
                  <Defs>
                    <LinearGradient id={id('beam')} x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0.3" stopColor={st.accent} stopOpacity="0" />
                      <Stop offset="0.5" stopColor={st.accent} stopOpacity="1" />
                      <Stop offset="0.7" stopColor={st.accent} stopOpacity="0" />
                    </LinearGradient>
                  </Defs>
                  <Rect width={big} height={big} fill={`url(#${id('beam')})`} />
                </Svg>
              </Animated.View>
              <View style={{ position: 'absolute', right: -18, bottom: -10, opacity: 0.08, transform: [{ rotate: '-12deg' }] }}>
                <Ionicons name="trophy" size={Math.min(170, h * 0.75)} color={st.accent} />
              </View>
              {EMBERS.map(([x, s], i) => (
                <Animated.View key={`e${i}`} style={{ position: 'absolute', left: `${x}%`, top: h - 4, width: s, height: s, borderRadius: s, backgroundColor: st.accent,
                  opacity: still ? 0 : rise[i].interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.9, 0.5, 0] }),
                  transform: [{ translateY: rise[i].interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.85] }) },
                    { translateX: rise[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 6 : -6, 0] }) }] }} />
              ))}
              {sweepBand('white', 0.12)}
              <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 3, borderColor: st.border!, opacity: pulse(0.45) }]} />
              {frame(5, `${st.accent}88`)}
              {frame(9, `${st.accent}33`)}
              {/* a crown at the top of the card */}
              <View style={{ position: 'absolute', top: 1, left: w / 2 - 13 }}>
                <Svg width={26} height={14} viewBox="0 0 26 14">
                  <Path d="M2 13 L1 3 L7 8 L13 1 L19 8 L25 3 L24 13 Z" fill={st.accent} />
                  <Circle cx={13} cy={1.5} r={1.5} fill="#FFF7D6" />
                </Svg>
              </View>
              {corners(() => (
                <Svg width={22} height={22} viewBox="0 0 22 22">
                  <Path d="M1 21 V6 Q1 1 6 1 H21" stroke={st.accent} strokeWidth={1.6} fill="none" />
                  <Path d="M6 10 L10 6 L14 10 L10 14 Z" fill={st.accent} />
                </Svg>
              ), 4)}
              {[0, 1, 2, 3, 4, 5].map((i) => glint(i, '#FDE68A'))}
            </>
          )}
        </>
      )}
    </View>
  );
}

/** Diamond: a prism halo turning round the player's photo (drawn around the photo itself, so it's always centred). */
export function PhotoHalo({ size, still: frozen }: { size: number; still?: boolean }) {
  const { reduceMotion } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [spin] = useState(() => new Animated.Value(0));
  const still = reduceMotion || !!frozen;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [still, spin]);
  const d = size + 18;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: d, height: d, left: -9, top: -9, opacity: 0.85,
      transform: [{ rotate: still ? '20deg' : spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Svg width={d} height={d} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`prism${uid}`} x1="0" y1="0" x2="1" y2="1">
            {RAINBOW.map((c, i) => <Stop key={i} offset={String(i / (RAINBOW.length - 1))} stopColor={c} />)}
          </LinearGradient>
        </Defs>
        <Circle cx={50} cy={50} r={47} stroke={`url(#prism${uid})`} strokeWidth={2.4} fill="none" strokeDasharray="7 4" />
        <Circle cx={50} cy={50} r={43} stroke={`url(#prism${uid})`} strokeWidth={0.8} fill="none" opacity={0.7} />
      </Svg>
    </Animated.View>
  );
}
