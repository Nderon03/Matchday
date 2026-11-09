import React, { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { levelInfo } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/** Each level is its own metal, and the higher it is the more it does. */
const METAL: Record<number, { rim: string[]; face: string[]; icon: string; edge: string }> = {
  1: { rim: ['#F3BC8A', '#C27A43', '#7E3F18'], face: ['#E0A06A', '#B26A35', '#87461D'], icon: '#4A220C', edge: 'rgba(255,225,190,0.55)' }, // Bronze: warm copper
  2: { rim: ['#FFFFFF', '#C9D1DB', '#7C8896'], face: ['#FBFCFE', '#D5DCE4', '#9AA6B4'], icon: '#2E3A48', edge: 'rgba(255,255,255,0.9)' }, // Silver: bright, cool
  3: { rim: ['#FFF6C2', '#F7C531', '#A66A00'], face: ['#FFEB8A', '#F5B70F', '#C98500'], icon: '#5C3700', edge: 'rgba(255,248,200,0.95)' }, // Gold: rich, shiny
  4: { rim: ['#FFFFFF', '#B8F4FC', '#4FB3C7'], face: ['#F4FEFF', '#BDF1F8', '#7FD3E2'], icon: '#0B4654', edge: 'rgba(255,255,255,1)' }, // Platinum: icy
  5: { rim: ['#FFF1B0', '#E879F9', '#6D28D9'], face: ['#8B5CF6', '#5B21B6', '#2E1065'], icon: '#FDE68A', edge: 'rgba(253,230,138,0.95)' }, // Legend: purple + gold
};

const pt = (r: number, deg: number, cx = 50, cy = 52) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const;
const star = (points: number, outer: number, inner: number, cx = 50, cy = 52, rot = -90) =>
  Array.from({ length: points * 2 }, (_, i) => pt(i % 2 ? inner : outer, rot + (i * 180) / points, cx, cy).join(',')).join(' ');

/**
 * Round medal for an achievement track, drawn as the metal of the level reached:
 * Bronze (plain copper) → Silver (milled edge) → Gold (laurel wreath, shine) →
 * Platinum (starburst, frequent shine) → Legend (crown, turning rays, sparkles, glow).
 * Level 0 is an empty medal with a ring showing progress to Bronze.
 */
export function AchievementBadge({ icon, level, progress = 0, target = 1, size = 56, animate = true }: {
  icon: string;
  level: number;
  /** progress towards the next level (0..target) */
  progress?: number;
  target?: number;
  size?: number;
  animate?: boolean;
}) {
  const { colors, reduceMotion } = useTheme();
  // gradient ids must be unique on the page (and plain letters/numbers for url(#id) on web)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const lv = Math.max(0, Math.min(5, level));
  const earned = lv > 0;
  const m = METAL[lv || 1];
  const nextColour = levelInfo(Math.min(5, lv + 1)).colour;
  const pct = lv >= 5 ? 0 : Math.max(0, Math.min(1, target ? progress / target : 0));
  const live = animate && !reduceMotion;
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!live || lv < 3) return;
    // a light sweep across the face; more often the higher the medal
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(400 + Math.random() * 1600),
      Animated.timing(sweep, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      Animated.delay(lv >= 5 ? 1200 : lv >= 4 ? 1800 : 4200),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live, lv, sweep]);

  useEffect(() => {
    if (!live || lv < 5) return;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    const turn = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: native }));
    pulse.start();
    turn.start();
    return () => { pulse.stop(); turn.stop(); };
  }, [live, lv, glow, spin]);

  const ringR = 47;
  const circ = 2 * Math.PI * ringR;
  const face = size * 0.52; // the medal face, for the icon and the shine
  const id = (n: string) => `${n}${uid}`;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Legend: a soft glow and slowly turning rays behind the medal */}
      {lv >= 5 && (
        <>
          <Animated.View style={{
            position: 'absolute', width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: '#C084FC',
            opacity: live ? glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] }) : 0.28,
            transform: [{ scale: live ? glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) : 1.06 }],
          }} />
          <Animated.View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
            <Svg width={size} height={size} viewBox="0 0 100 104">
              <Defs>
                <RadialGradient id={id('ray')} cx="50%" cy="50%" r="50%">
                  <Stop offset="0.45" stopColor="#FDE68A" stopOpacity="0.9" />
                  <Stop offset="1" stopColor="#E879F9" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Polygon points={star(16, 50, 30)} fill={`url(#${id('ray')})`} />
            </Svg>
          </Animated.View>
        </>
      )}

      <Svg width={size} height={size} viewBox="0 0 100 104" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id('rim')} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={m.rim[0]} />
            <Stop offset="0.5" stopColor={m.rim[1]} />
            <Stop offset="1" stopColor={m.rim[2]} />
          </LinearGradient>
          <RadialGradient id={id('face')} cx="38%" cy="32%" r="75%">
            <Stop offset="0" stopColor={m.face[0]} />
            <Stop offset="0.55" stopColor={m.face[1]} />
            <Stop offset="1" stopColor={m.face[2]} />
          </RadialGradient>
          <LinearGradient id={id('leaf')} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF3B0" />
            <Stop offset="1" stopColor="#C98A00" />
          </LinearGradient>
          <LinearGradient id={id('burst')} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#67E8F9" stopOpacity="0.75" />
          </LinearGradient>
        </Defs>

        {/* progress towards the next level (and the empty ring before Bronze) */}
        {!earned && <Circle cx={50} cy={52} r={ringR} stroke={colors.border} strokeWidth={4} fill="none" />}
        {pct > 0 && (
          <Circle cx={50} cy={52} r={ringR} stroke={nextColour} strokeWidth={4} fill="none" strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 50 52)" />
        )}

        {earned ? (
          <G>
            {/* Platinum: a starburst behind the medal */}
            {lv === 4 && <Polygon points={star(12, 46, 34)} fill={`url(#${id('burst')})`} />}
            {/* Gold and up: a laurel wreath */}
            {lv >= 3 && [-1, 1].map((side) => (
              <G key={side}>
                {[0, 1, 2, 3, 4].map((i) => {
                  // up each side from the bottom, leaves following the curve
                  const a = side < 0 ? 104 + i * 25 : 76 - i * 25;
                  const [x, y] = pt(40, a);
                  return <Ellipse key={i} cx={x} cy={y} rx={6.5} ry={2.8} fill={lv === 5 ? '#FDE68A' : `url(#${id('leaf')})`} transform={`rotate(${a + 90 + side * 25} ${x} ${y})`} />;
                })}
              </G>
            ))}
            {/* Silver: a milled (coin) edge */}
            {lv === 2 && Array.from({ length: 24 }, (_, i) => {
              const [x, y] = pt(34, i * 15);
              return <Circle key={i} cx={x} cy={y} r={3.2} fill={`url(#${id('rim')})`} />;
            })}
            <Circle cx={50} cy={52} r={lv >= 3 ? 32 : 33} fill={`url(#${id('rim')})`} />
            <Circle cx={50} cy={52} r={lv >= 3 ? 25 : 26} fill={`url(#${id('face')})`} stroke={m.edge} strokeWidth={1.2} />
            {/* a highlight on the top-left, like light on metal */}
            <Path d="M 30 44 A 22 22 0 0 1 52 30" stroke="rgba(255,255,255,0.55)" strokeWidth={2.4} strokeLinecap="round" fill="none" />
            {/* Legend: a crown and sparkles */}
            {lv === 5 && (
              <>
                <Path d="M 36 22 L 38 10 L 44 17 L 50 6 L 56 17 L 62 10 L 64 22 Z" fill="#FDE68A" stroke="#B45309" strokeWidth={1.2} strokeLinejoin="round" />
                <Circle cx={50} cy={6} r={2} fill="#FFF7D6" />
                <Polygon points={star(4, 6, 1.6, 84, 22, 0)} fill="#FFF7D6" />
                <Polygon points={star(4, 4.5, 1.2, 16, 80, 0)} fill="#FFF7D6" />
                <Polygon points={star(4, 4, 1.1, 86, 86, 0)} fill="#FDE68A" />
              </>
            )}
          </G>
        ) : (
          <Circle cx={50} cy={52} r={33} fill={colors.surfaceAlt} />
        )}
      </Svg>

      <View style={{ position: 'absolute', top: size * 0.5 - face / 2 + size * 0.02, width: face, height: face, borderRadius: face / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as any} size={Math.round(face * 0.56)} color={earned ? m.icon : colors.textFaint} style={{ opacity: earned ? 1 : 0.6 }} />
        {live && lv >= 3 && (
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: -face * 0.2, bottom: -face * 0.2, width: face * 0.3, backgroundColor: 'rgba(255,255,255,0.45)',
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-face, face] }) }, { rotate: '20deg' }],
          }} />
        )}
      </View>
    </View>
  );
}
