import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, fonts } from '@/theme/tokens';

const native = Platform.OS !== 'web';
const G = '#22C55E';

/** Plays `run` each time the slide becomes active (or jumps to the end state when motion is reduced). */
function useEntrance(active: boolean, reduceMotion: boolean, values: Animated.Value[], run: () => Animated.CompositeAnimation) {
  useEffect(() => {
    if (!active) return;
    if (reduceMotion) { values.forEach((v) => v.setValue(1)); return; }
    values.forEach((v) => v.setValue(0));
    const a = run();
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduceMotion]);
}

/** Slide 1: the MATCHDAY mark assembles itself (tile pops, ring turns, kick-off spot drops in). */
export function LogoVisual({ active }: { active: boolean }) {
  const { reduceMotion } = useTheme();
  const [tile] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  const [spot] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  useEntrance(active, reduceMotion, [tile, ring, spot, glow], () => Animated.parallel([
    Animated.spring(tile, { toValue: 1, friction: 6, tension: 60, useNativeDriver: native }),
    Animated.timing(ring, { toValue: 1, duration: 900, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
    Animated.spring(spot, { toValue: 1, friction: 4, tension: 90, delay: 650, useNativeDriver: native }),
    Animated.timing(glow, { toValue: 1, duration: 1200, delay: 300, useNativeDriver: native }),
  ]));
  return (
    <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(34,197,94,0.16)',
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }} />
      <Animated.View style={{ opacity: tile, transform: [{ scale: tile.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}>
        <Svg width={150} height={150} viewBox="0 0 1024 1024">
          <Rect width={1024} height={1024} rx={230} fill="#0A0C0F" />
          <Path d="M230 0 H512 V1024 H230 A230 230 0 0 1 0 794 V230 A230 230 0 0 1 230 0 Z" fill={G} />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', opacity: ring, transform: [{ rotate: ring.interpolate({ inputRange: [0, 1], outputRange: ['-120deg', '0deg'] }) }] }}>
        <Svg width={150} height={150} viewBox="0 0 1024 1024">
          <Path d="M512 270 A242 242 0 0 1 512 754" fill="none" stroke={G} strokeWidth={64} />
          <Path d="M512 270 A242 242 0 0 0 512 754" fill="none" stroke="#0A0C0F" strokeWidth={64} />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', transform: [{ scale: spot }] }}>
        <Svg width={20} height={20}><Circle cx={10} cy={10} r={9} fill="#F5F7FA" /></Svg>
      </Animated.View>
    </View>
  );
}

// positions on a 200 x 260 pitch (team A bottom half, team B top half)
const SPOTS = {
  A: [[100, 236], [50, 190], [150, 190], [70, 152], [130, 152]],
  B: [[100, 24], [50, 70], [150, 70], [70, 108], [130, 108]],
};

/** Slide 2: two teams run out from the centre spot into a balanced shape, keepers last. */
export function PitchVisual({ active }: { active: boolean }) {
  const { reduceMotion } = useTheme();
  const [players] = useState(() => Array.from({ length: 10 }, () => new Animated.Value(0)));
  const [bars] = useState(() => new Animated.Value(0));
  useEntrance(active, reduceMotion, [...players, bars], () => Animated.parallel([
    Animated.stagger(70, players.map((p) => Animated.spring(p, { toValue: 1, friction: 7, tension: 50, useNativeDriver: native }))),
    Animated.timing(bars, { toValue: 1, duration: 900, delay: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
  ]));
  const dot = (team: 'A' | 'B', i: number) => {
    const [x, y] = SPOTS[team][i];
    const v = players[(team === 'A' ? 0 : 5) + i];
    const keeper = i === 0;
    return (
      <Animated.View key={team + i} style={{ position: 'absolute', left: 100 - 13, top: 130 - 13, width: 26, height: 26, borderRadius: 13,
        backgroundColor: team === 'A' ? G : '#F5F7FA', borderWidth: keeper ? 3 : 0, borderColor: '#FACC15',
        opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, x - 100] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, y - 130] }) }] }} />
    );
  };
  const line = 'rgba(255,255,255,0.35)';
  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      <View style={{ width: 200, height: 260, borderRadius: radius.lg, backgroundColor: '#14532D', borderWidth: 2, borderColor: line, overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 44, height: 22, backgroundColor: 'rgba(255,255,255,0.03)' }} />)}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 129, height: 2, backgroundColor: line }} />
        <View style={{ position: 'absolute', left: 64, top: 94, width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: line }} />
        <View style={{ position: 'absolute', left: 55, top: -2, width: 90, height: 40, borderWidth: 2, borderColor: line }} />
        <View style={{ position: 'absolute', left: 55, bottom: -2, width: 90, height: 40, borderWidth: 2, borderColor: line }} />
        {[0, 1, 2, 3, 4].map((i) => dot('B', i))}
        {[0, 1, 2, 3, 4].map((i) => dot('A', i))}
      </View>
      <View style={{ width: 200, gap: 6 }}>
        {([['Bibs', 7.4, G], ['Non-bibs', 7.3, '#F5F7FA']] as const).map(([name, r, c]) => (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" tone="muted" style={{ width: 62 }}>{name}</Text>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: c, width: bars.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${(r / 10) * 100}%`] }) }} />
            </View>
            <Text variant="caption" style={{ width: 24, textAlign: 'right' }}>{r.toFixed(1)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CountUp({ to, active, decimals = 0, suffix = '', delay = 0 }: { to: number; active: boolean; decimals?: number; suffix?: string; delay?: number }) {
  const { reduceMotion } = useTheme();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active || reduceMotion) return;
    let raf = 0;
    const start = Date.now() + delay;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / 900));
      setV(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduceMotion, to, delay]);
  return <>{(reduceMotion ? to : v).toFixed(decimals)}{suffix}</>;
}

/** Slide 3: a player card flips up, stats count up and the form bars rise. */
export function StatsVisual({ active }: { active: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const [card] = useState(() => new Animated.Value(0));
  const [form] = useState(() => new Animated.Value(0));
  useEntrance(active, reduceMotion, [card, form], () => Animated.parallel([
    Animated.spring(card, { toValue: 1, friction: 7, tension: 45, useNativeDriver: native }),
    Animated.timing(form, { toValue: 1, duration: 900, delay: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
  ]));
  const FORM = [6.8, 7.4, 6.2, 8.1, 7.9];
  return (
    <Animated.View style={{ width: 256, borderRadius: radius.xl, padding: space.lg, gap: space.md, backgroundColor: '#13261B', borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)',
      opacity: card, transform: [{ perspective: 800 }, { rotateX: card.interpolate({ inputRange: [0, 1], outputRange: ['35deg', '0deg'] }) }, { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text style={{ fontSize: 52, lineHeight: 54, fontFamily: fonts.scoreHeavy, color: colors.text }}><CountUp to={7.8} decimals={1} active={active} /></Text>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">You</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>Midfielder</Text>
        </View>
        <Ionicons name="star" size={24} color={colors.gold} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {([['Goals', 24, '', 100], ['Assists', 17, '', 200], ['MOTM', 6, '', 300], ['Win', 58, '%', 400]] as const).map(([label, n, suf, d]) => (
          <View key={label} style={{ alignItems: 'center' }}>
            <Text variant="h3"><CountUp to={n} suffix={suf} active={active} delay={d} /></Text>
            <Text variant="caption" tone="muted">{label}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 44 }}>
        {FORM.map((r, i) => (
          <Animated.View key={i} style={{ flex: 1, borderRadius: 4, backgroundColor: i === FORM.length - 1 ? G : 'rgba(34,197,94,0.45)',
            height: form.interpolate({ inputRange: [0, 1], outputRange: [2, (r / 10) * 44] }) }} />
        ))}
      </View>
      <Text variant="caption" tone="faint">Form · last 5 games</Text>
    </Animated.View>
  );
}
