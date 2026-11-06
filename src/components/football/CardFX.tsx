import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Line, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import type { CardStyle } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';
// where the sparkles sit (percent of the card, round the edges so they never cover text)
const STARS: [number, number, number][] = [
  [3, 4, 10], [93, 3, 12], [95, 46, 9], [2, 52, 9], [96, 26, 9], [50, 1, 8], [24, 95, 8], [42, 97, 9],
];
// Hall of Fame embers: [left %, size, seconds to rise, start delay ms]
const EMBERS: [number, number, number, number][] = [
  [6, 3, 4.2, 0], [15, 2, 5.1, 900], [27, 4, 3.8, 2100], [38, 2, 4.6, 400], [49, 3, 5.4, 1600],
  [58, 2, 4.0, 2800], [67, 4, 4.8, 700], [76, 2, 3.6, 1900], [86, 3, 5.0, 300], [95, 2, 4.4, 2500],
];

/**
 * What each earned style adds. Every tier keeps the best of the one below and adds its own:
 *  Bronze   brushed-metal texture, bronze corner brackets, a slow shine
 *  Silver   carbon-mesh texture, glowing corner brackets, pulsing edge, a quicker shine
 *  Gold     sunburst rays turning behind your photo, gold corner ornaments, sparkles
 *  Platinum crystal facets, a rainbow holographic sweep instead of a plain shine, more sparkles
 *  Hall of Fame  a golden beam turning, embers rising, trophy watermark, double edge
 */
interface Tier { texture: 'brushed' | 'mesh' | 'facets' | null; corners: 'bracket' | 'glow' | 'ornament' | null; shine: 'slow' | 'quick' | 'holo' | null;
  glow: boolean; rays: boolean; stars: number; beam: boolean }
const TIERS: Record<string, Tier> = {
  bronze: { texture: 'brushed', corners: 'bracket', shine: 'slow', glow: false, rays: false, stars: 0, beam: false },
  silver: { texture: 'mesh', corners: 'glow', shine: 'quick', glow: true, rays: false, stars: 0, beam: false },
  gold: { texture: 'brushed', corners: 'ornament', shine: 'quick', glow: true, rays: true, stars: 4, beam: false },
  platinum: { texture: 'facets', corners: 'ornament', shine: 'holo', glow: true, rays: true, stars: 6, beam: false },
  hall_of_fame: { texture: null, corners: 'ornament', shine: 'quick', glow: true, rays: true, stars: 8, beam: true },
};

export function CardFX({ st, radius }: { st: CardStyle; radius: number }) {
  const { reduceMotion } = useTheme();
  const tier = TIERS[st.id];
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => STARS.map(() => new Animated.Value(0)));
  const [rise] = useState(() => EMBERS.map(() => new Animated.Value(0)));
  const still = reduceMotion || !tier;

  useEffect(() => {
    if (still || !tier) return;
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: tier.shine === 'slow' ? 2600 : 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.delay(tier.shine === 'slow' ? 3200 : 1800),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      ])),
      ...(tier.glow || tier.corners === 'glow' ? [Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: tier.beam ? 1000 : 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: tier.beam ? 1000 : 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]))] : []),
      ...twinkle.slice(0, tier.stars).map((t, i) => Animated.loop(Animated.sequence([
        Animated.delay(i * 380),
        Animated.timing(t, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        Animated.delay(1600 - i * 120),
      ]))),
      ...(tier.rays || tier.beam ? [Animated.loop(Animated.timing(spin, { toValue: 1, duration: tier.beam ? 9000 : 24000, easing: Easing.linear, useNativeDriver: native }))] : []),
      ...(tier.beam ? rise.map((r, i) => Animated.loop(Animated.sequence([
        Animated.delay(EMBERS[i][3]),
        Animated.timing(r, { toValue: 1, duration: EMBERS[i][2] * 1000, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: native }),
      ]))) : []),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, tier, sweep, glow, spin, twinkle, rise]);

  if (!tier) return null;
  const { w, h } = size;
  const band = Math.max(60, w * 0.22);
  const big = Math.max(w, h) * 1.6;
  const pulse = (lo: number) => (still ? (lo + 1) / 2 : glow.interpolate({ inputRange: [0, 1], outputRange: [lo, 1] }));
  const rotate = (deg = 360) => (still ? '20deg' : spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${deg}deg`] }));
  const gid = `fx-${st.id}`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {w > 0 && (
        <>
          {/* texture */}
          {tier.texture && (
            <Svg width={w} height={h} style={StyleSheet.absoluteFill} opacity={tier.texture === 'facets' ? 0.16 : 0.1}>
              {tier.texture === 'brushed' && Array.from({ length: Math.ceil((w + h) / 7) }, (_, i) => (
                <Line key={i} x1={i * 7} y1={0} x2={i * 7 - h} y2={h} stroke={st.accent} strokeWidth={0.6} />
              ))}
              {tier.texture === 'mesh' && (
                <>
                  <Defs>
                    <Pattern id={`${gid}-mesh`} patternUnits="userSpaceOnUse" width={10} height={10}>
                      <Rect x={0} y={0} width={2} height={2} fill={st.accent} />
                      <Rect x={5} y={5} width={2} height={2} fill={st.accent} />
                    </Pattern>
                  </Defs>
                  <Rect width={w} height={h} fill={`url(#${gid}-mesh)`} />
                </>
              )}
              {tier.texture === 'facets' && (
                <Path stroke={st.accent} strokeWidth={0.8} fill="none"
                  d={`M0 ${h * 0.35} L${w * 0.3} 0 L${w * 0.55} ${h * 0.5} L${w} ${h * 0.15} M${w * 0.3} 0 L${w * 0.2} ${h} M${w * 0.55} ${h * 0.5} L${w * 0.75} ${h} M${w * 0.55} ${h * 0.5} L0 ${h * 0.8} M${w} ${h * 0.6} L${w * 0.55} ${h * 0.5} L${w * 0.9} 0`} />
              )}
            </Svg>
          )}

          {/* sunburst rays turning slowly behind the photo (Gold, Platinum) */}
          {tier.rays && (
            <Animated.View style={{ position: 'absolute', width: big, height: big, left: w * 0.38 - big / 2, top: h * 0.3 - big / 2, opacity: st.id === 'gold' ? 0.1 : 0.06,
              transform: [{ rotate: rotate() }] }}>
              <Svg width={big} height={big}>
                {Array.from({ length: 18 }, (_, i) => {
                  const a = (i / 18) * Math.PI * 2;
                  const a2 = a + Math.PI / 36;
                  const c = big / 2;
                  return <Path key={i} fill={st.accent} d={`M${c} ${c} L${c + Math.cos(a) * c} ${c + Math.sin(a) * c} L${c + Math.cos(a2) * c} ${c + Math.sin(a2) * c} Z`} />;
                })}
              </Svg>
            </Animated.View>
          )}

          {/* Hall of Fame: a golden beam turning, a trophy, embers rising */}
          {tier.beam && (
            <>
              <Animated.View style={{ position: 'absolute', width: big, height: big, left: (w - big) / 2, top: (h - big) / 2, opacity: 0.22, transform: [{ rotate: rotate() }] }}>
                <Svg width={big} height={big}>
                  <Defs>
                    <LinearGradient id={`${gid}-beam`} x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0.3" stopColor={st.accent} stopOpacity="0" />
                      <Stop offset="0.5" stopColor={st.accent} stopOpacity="1" />
                      <Stop offset="0.7" stopColor={st.accent} stopOpacity="0" />
                    </LinearGradient>
                  </Defs>
                  <Rect width={big} height={big} fill={`url(#${gid}-beam)`} />
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

          {/* the shine sweeping across: plain light, or a rainbow holographic band for Platinum */}
          {!still && (
            <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width: tier.shine === 'holo' ? band * 1.6 : band,
              opacity: tier.shine === 'holo' ? 0.2 : tier.beam ? 0.13 : 0.09,
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-band * 2, w + band] }) }, { rotate: '18deg' }] }}>
              {tier.shine === 'holo' ? (
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient id={`${gid}-holo`} x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor="#FF6EC7" stopOpacity="0" />
                      <Stop offset="0.25" stopColor="#FF6EC7" />
                      <Stop offset="0.45" stopColor="#FDE68A" />
                      <Stop offset="0.65" stopColor="#67E8F9" />
                      <Stop offset="0.85" stopColor="#A78BFA" />
                      <Stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#${gid}-holo)`} />
                </Svg>
              ) : <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />}
            </Animated.View>
          )}

          {/* corners */}
          {tier.corners && ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([cx, cy]) => (
            <Animated.View key={`${cx}${cy}`} style={{ position: 'absolute', [cx ? 'right' : 'left']: 6, [cy ? 'bottom' : 'top']: 6,
              opacity: tier.corners === 'glow' ? pulse(0.35) : 0.9 }}>
              {tier.corners === 'ornament' ? (
                <Svg width={15} height={15} style={{ transform: [{ scaleX: cx ? -1 : 1 }, { scaleY: cy ? -1 : 1 }] }}>
                  <Path d="M1 14 V4 Q1 1 4 1 H14" stroke={st.accent} strokeWidth={1.5} fill="none" />
                  <Path d="M4 7.5 L7.5 4 L11 7.5 L7.5 11 Z" fill={st.accent} />
                </Svg>
              ) : (
                <View style={{ width: 13, height: 13, borderColor: st.border ?? st.accent,
                  borderTopWidth: cy ? 0 : 2, borderBottomWidth: cy ? 2 : 0, borderLeftWidth: cx ? 0 : 2, borderRightWidth: cx ? 2 : 0 }} />
              )}
            </Animated.View>
          ))}

          {/* glowing edge */}
          {tier.glow && !!st.border && (
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: tier.beam ? 3 : 2, borderColor: st.border, opacity: pulse(tier.beam ? 0.45 : 0.25) }]} />
          )}

          {STARS.slice(0, tier.stars).map(([x, y, s], i) => (
            <Animated.View key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`,
              opacity: still ? 0.5 : twinkle[i], transform: [{ scale: still ? 1 : twinkle[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }}>
              <Ionicons name="sparkles" size={s} color={st.accent} />
            </Animated.View>
          ))}
        </>
      )}
    </View>
  );
}
