import React, { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
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
// Hall of Fame camera flashes: [left %, top %, size] (a burst, one after another)
const FLASHES: [number, number, number][] = [[14, 20, 110], [86, 14, 130], [78, 74, 100], [22, 80, 120], [52, 6, 90]];

/**
 * Each earned style has its own design, and each tier is a clear step up from the one below:
 *  Bronze        brushed copper lines, simple corner brackets, a soft sheen. Still.
 *  Silver        polished chrome: brushed grain, mirror reflections, a chrome frame, rivet corners. Still.
 *  Gold          black-and-gold foil: engraved guilloche rings, art-deco corners, a metallic double frame.
 *                The corner fans light up one after another, round the card (the first tier that moves).
 *  Platinum      engraved platinum plate: a fine ice-crystal lattice across the whole card, a cool glow behind
 *                your photo, a polished double frame and clean bracket corners. A ripple of light pulses out
 *                from your photo through the lattice every few seconds.
 *  Diamond       diamond-cut facets, a prism halo turning behind your photo, glints, a rainbow edge. Animated.
 *  Hall of Fame  royal purple and gold (the Legend medal's colours): a living aurora, gold sparks rising, a crown,
 *                and a laurel wreath with a ring of stars round the photo. Every 12 seconds or so the
 *                photographers go off: a burst of camera flashes round the card. The peak.
 */
export function CardFX({ st, radius, still: frozen }: { st: CardStyle; radius: number; still?: boolean }) {
  const { reduceMotion } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tier = st.id;
  const animated = st.fx >= 3; // gold's foil shine is the first moving tier
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => GLINTS.map(() => new Animated.Value(0)));
  const [rise] = useState(() => EMBERS.map(() => new Animated.Value(0)));
  const [ripple] = useState(() => [new Animated.Value(0), new Animated.Value(0)]);
  const [flashes] = useState(() => FLASHES.map(() => new Animated.Value(0)));
  const still = reduceMotion || !animated || !!frozen;

  useEffect(() => {
    if (still) return;
    const glints = tier === 'diamond' ? 8 : tier === 'hall_of_fame' ? 6 : 0;
    const loops = [
      // diamond: a quick white flash across the facets. gold: the corner fans light up in turn
      Animated.loop(Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: tier === 'gold' ? 2400 : 1600, easing: tier === 'gold' ? Easing.linear : Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.delay(tier === 'gold' ? 2600 : 1600),
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
        ? [Animated.loop(Animated.timing(spin, { toValue: 1, duration: tier === 'diamond' ? 12000 : 14000, easing: Easing.linear, useNativeDriver: native }))] : []),
      // platinum: two rings of light pulse out from the photo, then a pause
      ...(tier === 'platinum' ? [Animated.loop(Animated.sequence([
        Animated.delay(900),
        Animated.stagger(420, ripple.map((r) => Animated.timing(r, { toValue: 1, duration: 2200, easing: Easing.out(Easing.cubic), useNativeDriver: native }))),
        Animated.delay(2600),
        Animated.parallel(ripple.map((r) => Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: native }))),
      ]))] : []),
      // hall of fame: the photographers go off, a burst of flashes every 12 seconds or so
      ...(tier === 'hall_of_fame' ? [Animated.loop(Animated.sequence([
        Animated.delay(1400),
        Animated.stagger(170, flashes.map((f) => Animated.sequence([
          Animated.timing(f, { toValue: 1, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(f, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        ]))),
        Animated.delay(10600),
      ]))] : []),
      ...(tier === 'hall_of_fame' ? rise.map((r, i) => Animated.loop(Animated.sequence([
        Animated.delay(EMBERS[i][3]),
        Animated.timing(r, { toValue: 1, duration: EMBERS[i][2] * 1000, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: native }),
      ]))) : []),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, tier, sweep, glow, spin, twinkle, rise, ripple, flashes]);

  if (st.base || !['bronze', 'silver', 'gold', 'platinum', 'diamond', 'hall_of_fame'].includes(tier)) return null;
  const { w, h } = size;
  const id = (n: string) => `${n}${uid}`;
  // the photo sits roughly here on the card (gold's sunburst and diamond's halo centre on it)
  const cx = w * 0.4;
  const cy = h * 0.32;
  const pulse = (lo: number) => (still ? (lo + 1) / 2 : glow.interpolate({ inputRange: [0, 1], outputRange: [lo, 1] }));
  const band = Math.max(60, w * 0.22);

  const frame = (inset: number, colour: string, width = 1) => (
    <View style={{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: Math.max(4, radius - inset), borderWidth: width, borderColor: colour }} />
  );
  // a metallic frame: a gradient stroke that catches the light like polished metal
  const metal = (key: string, stops: [number, string][], inset: number, sw: number) => (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id(key)} x1="0" y1="0" x2="1" y2="1">
          {stops.map(([o, c]) => <Stop key={o} offset={String(o)} stopColor={c} />)}
        </LinearGradient>
      </Defs>
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={Math.max(4, radius - inset)} fill="none" stroke={`url(#${id(key)})`} strokeWidth={sw} />
    </Svg>
  );
  type Op = number | Animated.AnimatedInterpolation<number>;
  // corners in order round the card: top-left, top-right, bottom-right, bottom-left
  const corners = (render: (flipX: boolean, flipY: boolean) => React.ReactNode, inset = 7, opacity: Op | ((i: number) => Op) = 0.95) =>
    ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([fx, fy], i) => (
      <Animated.View key={`${fx}${fy}`} style={{ position: 'absolute', [fx ? 'right' : 'left']: inset, [fy ? 'bottom' : 'top']: inset,
        opacity: typeof opacity === 'function' ? opacity(i) : opacity,
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
  const sweepBand = (opacity: number, width = band) => !still && (
    <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width, opacity, backgroundColor: '#FFFFFF',
      transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 2, w + width] }) }, { rotate: '18deg' }] }} />
  );
  // gold: each corner fan brightens as the light comes round to it
  const fanLight = (i: number): Op => (still ? 0.95 : sweep.interpolate({
    inputRange: [0, i * 0.25, i * 0.25 + 0.12, i * 0.25 + 0.3, 1].map((v) => Math.min(1, v)).map((v, k, a) => (k && v <= a[k - 1] ? a[k - 1] + 0.0001 : v)),
    outputRange: [0.55, 0.55, 1, 0.55, 0.55], extrapolate: 'clamp' }));

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

          {/* ---------- SILVER: polished chrome, brushed grain, mirror reflections, rivet corners ---------- */}
          {tier === 'silver' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id={id('mirror')} x1="0" y1="0" x2="1" y2="0.75">
                    <Stop offset="0.1" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="0.16" stopColor="#FFFFFF" stopOpacity="0.16" />
                    <Stop offset="0.24" stopColor="#FFFFFF" stopOpacity="0.03" />
                    <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity="0.1" />
                    <Stop offset="0.31" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="0.68" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="0.76" stopColor="#FFFFFF" stopOpacity="0.07" />
                    <Stop offset="0.84" stopColor="#FFFFFF" stopOpacity="0" />
                  </LinearGradient>
                  <RadialGradient id={id('gloss')} cx={w * 0.5} cy={-h * 0.15} r={Math.max(w, h) * 0.7} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                {/* brushed grain: fine lines of uneven brightness */}
                {Array.from({ length: Math.ceil(h / 3) }, (_, i) => (
                  <Line key={i} x1={0} y1={i * 3} x2={w} y2={i * 3} stroke="#FFFFFF" strokeWidth={0.5} opacity={[0.035, 0.07, 0.02, 0.05, 0.09][i % 5]} />
                ))}
                <Rect width={w} height={h} fill={`url(#${id('gloss')})`} />
                <Rect width={w} height={h} fill={`url(#${id('mirror')})`} />
              </Svg>
              {metal('chrome', [[0, '#FFFFFF'], [0.25, '#7D8894'], [0.5, '#F8FAFC'], [0.75, '#66717D'], [1, '#E5E9EE']], 5, 1.6)}
              {corners(() => (
                <Svg width={22} height={22} viewBox="0 0 22 22">
                  <Path d="M1 13 L1 6 L6 1 L13 1" stroke="#F1F5F9" strokeWidth={1.6} fill="none" />
                  <Path d="M5 13 L5 8 L8 5 L13 5" stroke="#AAB4C0" strokeWidth={0.8} fill="none" />
                  <Circle cx={10} cy={10} r={1.8} fill="#E8EDF3" />
                  <Circle cx={9.5} cy={9.5} r={0.7} fill="#FFFFFF" />
                </Svg>
              ), 7)}
            </>
          )}

          {/* ---------- GOLD: black-and-gold foil, engraved guilloche, art-deco corners, a foil shine ---------- */}
          {tier === 'gold' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                  <RadialGradient id={id('warm')} cx={cx} cy={cy} r={Math.max(w, h) * 0.6} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#FFD45C" stopOpacity="0.2" />
                    <Stop offset="1" stopColor="#FFD45C" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('warm')})`} />
                {/* engraved rings from two corners cross like a banknote */}
                <G opacity={0.09}>
                  {Array.from({ length: Math.ceil(Math.max(w, h) * 1.3 / 7) }, (_, i) => (
                    <Circle key={`a${i}`} cx={w * 1.05} cy={h * 1.08} r={18 + i * 7} stroke="#FFD45C" strokeWidth={0.6} fill="none" />
                  ))}
                  {Array.from({ length: Math.ceil(Math.max(w, h) * 0.9 / 9) }, (_, i) => (
                    <Circle key={`b${i}`} cx={-w * 0.05} cy={-h * 0.1} r={18 + i * 9} stroke="#FFD45C" strokeWidth={0.5} fill="none" />
                  ))}
                </G>
              </Svg>
              {metal('foil', [[0, '#FFF3B8'], [0.22, '#D9A21B'], [0.45, '#7A560C'], [0.62, '#FBE08A'], [0.82, '#B8860B'], [1, '#FFE9A0']], 4, 2.2)}
              {frame(10, '#FFD45C40')}
              {corners(() => (
                <Svg width={30} height={30} viewBox="0 0 30 30">
                  {/* an art-deco fan tucked into the corner */}
                  {[8, 14, 20].map((r, i) => <Path key={r} d={`M${r} 1 A${r - 1} ${r - 1} 0 0 1 1 ${r}`} stroke="#FFD45C" strokeWidth={i === 2 ? 1.4 : 0.9} fill="none" opacity={1 - i * 0.2} />)}
                  {[20, 45, 70].map((deg) => (
                    <Line key={deg} x1={1} y1={1} x2={1 + Math.cos((deg * Math.PI) / 180) * 19} y2={1 + Math.sin((deg * Math.PI) / 180) * 19} stroke="#FFD45C" strokeWidth={0.6} opacity={0.7} />
                  ))}
                  <Path d="M24 2 L26 4 L24 6 L22 4 Z M2 22 L4 24 L2 26 L0 24 Z" fill="#FFE9A0" />
                </Svg>
              ), 5, fanLight)}
            </>
          )}

          {/* ---------- PLATINUM: engraved platinum plate, ice lattice edge to edge, polished frame, a light ripple ---------- */}
          {tier === 'platinum' && (
            <>
              <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                  <Pattern id={id('hex')} patternUnits="userSpaceOnUse" width={18} height={31.2}>
                    <Path d="M9 0 L18 5.2 L18 15.6 L9 20.8 L0 15.6 L0 5.2 Z M9 20.8 L9 31.2" stroke="#E6FBFF" strokeWidth={0.6} fill="none" />
                  </Pattern>
                  {/* cool light behind the photo, a polished sheen from the top, darker edges */}
                  <RadialGradient id={id('cool')} cx={cx} cy={cy} r={Math.max(w, h) * 0.55} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#CFFAFE" stopOpacity="0.22" />
                    <Stop offset="1" stopColor="#CFFAFE" stopOpacity="0" />
                  </RadialGradient>
                  <LinearGradient id={id('polish')} x1="0" y1="0" x2="0.35" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.12" />
                    <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0" />
                  </LinearGradient>
                  <RadialGradient id={id('vig')} cx="50%" cy="50%" r="75%">
                    <Stop offset="0.6" stopColor="#000000" stopOpacity="0" />
                    <Stop offset="1" stopColor="#000000" stopOpacity="0.35" />
                  </RadialGradient>
                </Defs>
                <Rect width={w} height={h} fill={`url(#${id('cool')})`} />
                <Rect width={w} height={h} fill={`url(#${id('hex')})`} opacity={0.11} />
                <Rect width={w} height={h} fill={`url(#${id('polish')})`} />
                <Rect width={w} height={h} fill={`url(#${id('vig')})`} />
              </Svg>
              {/* the ripple: rings of light pulsing out from the photo through the lattice */}
              {!still && ripple.map((r, i) => {
                const D = Math.max(w, h) * 0.5;
                return (
                  <Animated.View key={`r${i}`} style={{ position: 'absolute', left: cx - D / 2, top: cy - D / 2, width: D, height: D,
                    opacity: r.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, i ? 0.35 : 0.6, 0] }),
                    transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.35, 3.2] }) }] }}>
                    <Svg width={D} height={D} viewBox="0 0 100 100">
                      <Path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z" stroke="#E6FBFF" strokeWidth={1.4} fill="none" />
                    </Svg>
                  </Animated.View>
                );
              })}
              {metal('plat', [[0, '#FFFFFF'], [0.22, '#9DB7C1'], [0.48, '#F4FDFF'], [0.74, '#6E8D99'], [1, '#E6FBFF']], 4, 2)}
              {frame(9, '#E6FBFF2E')}
              {corners(() => (
                <Svg width={26} height={26} viewBox="0 0 26 26">
                  {/* a clean double bracket with a small hexagon at its point */}
                  <Path d="M1 20 L1 1 L20 1" stroke="#F4FDFF" strokeWidth={1.5} fill="none" />
                  <Path d="M5.5 14 L5.5 5.5 L14 5.5" stroke="#BDF4FF" strokeWidth={0.8} fill="none" opacity={0.8} />
                  <Path d="M10 6.5 L13.5 8.5 L13.5 12.5 L10 14.5 L6.5 12.5 L6.5 8.5 Z" fill="#F4FDFF" transform="translate(1 1)" />
                </Svg>
              ), 10)}
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
              {sweepBand(0.16, band * 0.6)}
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
                <Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M8 0 L16 8 L8 16 L0 8 Z" fill="#E0F2FE" /><Path d="M8 0 L8 16 M0 8 L16 8" stroke="#0EA5E9" strokeWidth={0.8} /></Svg>
              ), 7)}
              {GLINTS.map((_, i) => glint(i, i % 3 === 0 ? '#A5F3FC' : '#FFFFFF'))}
            </>
          )}

          {/* ---------- HALL OF FAME: the peak. Royal purple and gold: a living aurora, light running round the
               frame, gold sparks rising, a crown, and a laurel wreath round the photo (see PhotoLaurel) ---------- */}
          {tier === 'hall_of_fame' && (
            <>
              {/* aurora: soft gold and magenta light drifting across the purple */}
              {([[st.accent, 0.34, -0.25, -0.35, 1], ['#D946EF', 0.3, 0.35, 0.25, -1], ['#FDE68A', 0.16, 0.6, -0.2, 1]] as const).map(([c, o, bx, by, dir], i) => {
                const A = Math.max(w, h) * (i === 2 ? 0.8 : 1.15);
                return (
                  <Animated.View key={`a${i}`} style={{ position: 'absolute', width: A, height: A, left: w * bx, top: h * by, opacity: o,
                    transform: still ? [] : [
                      { translateX: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, dir * w * 0.3, 0] }) },
                      { translateY: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -dir * h * 0.22, 0] }) },
                    ] }}>
                    <Svg width={A} height={A}>
                      <Defs>
                        <RadialGradient id={id(`au${i}`)} cx="50%" cy="50%" r="50%">
                          <Stop offset="0" stopColor={c} stopOpacity="0.9" />
                          <Stop offset="0.55" stopColor={c} stopOpacity="0.25" />
                          <Stop offset="1" stopColor={c} stopOpacity="0" />
                        </RadialGradient>
                      </Defs>
                      <Circle cx={A / 2} cy={A / 2} r={A / 2} fill={`url(#${id(`au${i}`)})`} />
                    </Svg>
                  </Animated.View>
                );
              })}
              {/* gold sparks rising */}
              {EMBERS.map(([x, s2], i) => (
                <Animated.View key={`e${i}`} style={{ position: 'absolute', left: `${x}%`, top: h - 6,
                  opacity: still ? 0 : rise[i].interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.6, 0] }),
                  transform: [{ translateY: rise[i].interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.9] }) },
                    { translateX: rise[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 8 : -8, 0] }) },
                    { rotate: rise[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', i % 2 ? '180deg' : '-180deg'] }) }] }}>
                  <Svg width={s2 * 3} height={s2 * 3} viewBox="0 0 20 20"><Path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill={i % 3 ? st.accent : '#FFF7D6'} /></Svg>
                </Animated.View>
              ))}
              {/* the frame: a clean double gold line */}
              {frame(0, `${st.accent}AA`, 2)}
              {frame(6, `${st.accent}55`)}
              {/* camera flashes: the whole card lights for an instant, with a star-shaped flare at each camera */}
              {!still && (
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF',
                  opacity: Animated.add(Animated.add(flashes[0], flashes[1]), Animated.add(Animated.add(flashes[2], flashes[3]), flashes[4]))
                    .interpolate({ inputRange: [0, 1], outputRange: [0, 0.16], extrapolate: 'clamp' }) }]} />
              )}
              {!still && FLASHES.map(([x, y, S], i) => (
                <Animated.View key={`f${i}`} style={{ position: 'absolute', left: (w * x) / 100 - S / 2, top: (h * y) / 100 - S / 2, width: S, height: S,
                  opacity: flashes[i], transform: [{ scale: flashes[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { rotate: `${i * 17}deg` }] }}>
                  <Svg width={S} height={S} viewBox="0 0 100 100">
                    <Defs>
                      <RadialGradient id={id(`fl${i}`)} cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                        <Stop offset="0.18" stopColor="#FFFFFF" stopOpacity="0.85" />
                        <Stop offset="0.45" stopColor="#FFF7D6" stopOpacity="0.25" />
                        <Stop offset="1" stopColor="#FFF7D6" stopOpacity="0" />
                      </RadialGradient>
                    </Defs>
                    <Circle cx={50} cy={50} r={50} fill={`url(#${id(`fl${i}`)})`} />
                    <Path d="M50 0 L52 48 L100 50 L52 52 L50 100 L48 52 L0 50 L48 48 Z" fill="#FFFFFF" opacity={0.9} />
                  </Svg>
                </Animated.View>
              ))}
              {/* a crown at the top of the card */}
              <View style={{ position: 'absolute', top: 2, left: w / 2 - 15 }}>
                <Svg width={30} height={16} viewBox="0 0 30 16">
                  <Defs>
                    <LinearGradient id={id('crown')} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFF1B0" />
                      <Stop offset="1" stopColor={st.accent} />
                    </LinearGradient>
                  </Defs>
                  <Path d="M2 15 L1 4 L8 9 L15 1 L22 9 L29 4 L28 15 Z" fill={`url(#${id('crown')})`} />
                  <Circle cx={15} cy={1.8} r={1.8} fill="#FFFFFF" />
                  <Circle cx={8} cy={12} r={1.2} fill="#D946EF" /><Circle cx={15} cy={12} r={1.4} fill="#D946EF" /><Circle cx={22} cy={12} r={1.2} fill="#D946EF" />
                </Svg>
              </View>
              {corners(() => (
                <Svg width={18} height={18} viewBox="0 0 18 18">
                  <Path d="M1 17 V6 Q1 1 6 1 H17" stroke={st.accent} strokeWidth={1.4} fill="none" />
                  <Path d="M5 9 L8 6 L11 9 L8 12 Z" fill={st.accent} />
                </Svg>
              ), 8)}
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

/**
 * Hall of Fame: a golden laurel wreath round the player's photo, with a ring of tiny stars turning
 * inside it (drawn round the photo itself, so it always fits).
 */
export function PhotoLaurel({ size, still: frozen }: { size: number; still?: boolean }) {
  const { reduceMotion } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [spin] = useState(() => new Animated.Value(0));
  const [shine] = useState(() => new Animated.Value(0));
  const still = reduceMotion || !!frozen;
  useEffect(() => {
    if (still) return;
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: native })),
      Animated.loop(Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(shine, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, spin, shine]);
  const pad = 16;
  const d = size + pad * 2;
  const c = d / 2;
  const R = size / 2 + 10;
  // a stem up each side from the bottom, with leaves in pairs pointing up along it (a victory laurel)
  const toXY = (deg: number, r: number) => [c + Math.cos((deg * Math.PI) / 180) * r, c + Math.sin((deg * Math.PI) / 180) * r] as const;
  const START = 104;
  const END = 236; // left side: from just left of the bottom, up to the top-left
  const stem = (side: 1 | -1) => {
    const [x1, y1] = toXY(side === -1 ? START : 180 - START, R);
    const [x2, y2] = toXY(side === -1 ? END : 180 - END, R);
    return <Path key={`s${side}`} d={`M${x1} ${y1} A${R} ${R} 0 0 ${side === -1 ? 1 : 0} ${x2} ${y2}`} stroke="#E0A500" strokeWidth={1.3} fill="none" />;
  };
  const leaves = (side: 1 | -1) => Array.from({ length: 9 }, (_, i) => {
    const deg = START + 6 + i * 15;
    const a = side === -1 ? deg : 180 - deg;
    const sz = 1 - i * 0.045;
    return ([-1, 1] as const).map((k) => {
      // one leaf just outside the stem, one just inside, both leaning up the curve
      const [x, y] = toXY(a, R + k * 3.2);
      const tangent = a + (side === -1 ? 90 : -90);
      const rot = tangent + k * side * 32;
      return <Ellipse key={`${side}${i}${k}`} cx={x} cy={y} rx={4.6 * sz} ry={2 * sz} fill={`url(#leaf${uid})`} transform={`rotate(${rot} ${x} ${y})`} />;
    });
  });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -pad, top: -pad, width: d, height: d }}>
      {/* a soft gold glow behind the photo */}
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: d, height: d, opacity: still ? 0.6 : shine.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] }) }}>
        <Svg width={d} height={d}>
          <Defs>
            <RadialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor="#F5C542" stopOpacity="0.45" />
              <Stop offset="1" stopColor="#F5C542" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill={`url(#glow${uid})`} />
        </Svg>
      </Animated.View>
      {/* the wreath */}
      <Svg width={d} height={d} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={`leaf${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF1B0" />
            <Stop offset="1" stopColor="#E0A500" />
          </LinearGradient>
        </Defs>
        {stem(-1)}
        {stem(1)}
        {leaves(-1)}
        {leaves(1)}
        {/* the tie at the bottom */}
        <Path d={`M${c - 4} ${c + R + 1} Q${c} ${c + R - 2} ${c + 4} ${c + R + 1}`} stroke="#F5C542" strokeWidth={1.6} fill="none" />
        <Circle cx={c} cy={c + R} r={2} fill="#FFF1B0" />
      </Svg>
      {/* a ring of tiny stars turning inside the wreath */}
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: d, height: d,
        transform: [{ rotate: still ? '0deg' : spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <Svg width={d} height={d}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const x = c + Math.cos(a) * (size / 2 + 3);
            const y = c + Math.sin(a) * (size / 2 + 3);
            return <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.8} fill={i % 3 === 0 ? '#FFF7D6' : '#F5C542'} />;
          })}
        </Svg>
      </Animated.View>
    </View>
  );
}
