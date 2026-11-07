import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';
const PITCH = '#22C55E';

/** Fades and lifts something in, a beat after the one before it. */
export function Rise({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const { reduceMotion } = useTheme();
  const [a] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(a, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [a, delay, reduceMotion]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>{children}</Animated.View>;
}

/** Night match under the lights: a pitch in perspective, sweeping floodlights and a ball. */
function StadiumHero({ height }: { height: number }) {
  const { colors, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const [sweep] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(sweep, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [sweep, bob, reduceMotion]);

  const w = Math.max(width, 360);
  const h = height;
  const beam = (side: 1 | -1) => (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -40, [side === 1 ? 'left' : 'right']: -w * 0.15, width: w * 0.8, height: h + 60, opacity: 0.55,
      transform: [{ rotate: sweep.interpolate({ inputRange: [0, 1], outputRange: side === 1 ? ['-8deg', '6deg'] : ['8deg', '-6deg'] }) }] }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`beam${side}`} x1={side === 1 ? '0' : '1'} y1="0" x2={side === 1 ? '0.7' : '0.3'} y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={side === 1 ? `M0 0 L${w * 0.18} 0 L${w * 0.8} ${h + 60} L${w * 0.25} ${h + 60} Z` : `M${w * 0.8} 0 L${w * 0.62} 0 L0 ${h + 60} L${w * 0.55} ${h + 60} Z`} fill={`url(#beam${side})`} />
      </Svg>
    </Animated.View>
  );

  // pitch markings in perspective (vanishing towards the top)
  const top = h * 0.38, bottom = h * 1.05;
  return (
    <View style={{ height, overflow: 'hidden' }} pointerEvents="none">
      <Svg width={w} height={h} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="night" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#030806" />
            <Stop offset="0.55" stopColor="#0A2415" />
            <Stop offset="1" stopColor={colors.bg} />
          </LinearGradient>
          <RadialGradient id="glow" cx="50%" cy="70%" r="60%">
            <Stop offset="0" stopColor={PITCH} stopOpacity="0.28" />
            <Stop offset="1" stopColor={PITCH} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#night)" />
        <Rect width={w} height={h} fill="url(#glow)" />
        <Line x1={w * 0.3} y1={top} x2={-w * 0.1} y2={bottom} stroke="#FFFFFF" strokeOpacity={0.1} strokeWidth={1.5} />
        <Line x1={w * 0.7} y1={top} x2={w * 1.1} y2={bottom} stroke="#FFFFFF" strokeOpacity={0.1} strokeWidth={1.5} />
        <Line x1={w * 0.22} y1={h * 0.66} x2={w * 0.78} y2={h * 0.66} stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={1.5} />
        <Ellipse cx={w / 2} cy={h * 0.66} rx={w * 0.17} ry={h * 0.08} stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={1.5} fill="none" />
      </Svg>
      {!reduceMotion && beam(1)}
      {!reduceMotion && beam(-1)}
      {/* everything fades into the page at the bottom, so nothing ends in a hard edge */}
      <Svg width={w} height={h * 0.45} style={{ position: 'absolute', bottom: 0 }}>
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity="0" />
            <Stop offset="1" stopColor={colors.bg} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h * 0.45} fill="url(#fade)" />
      </Svg>
      <Animated.View style={{ position: 'absolute', left: w / 2 - 17, top: h * 0.66 - 44,
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }, { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '25deg'] }) }] }}>
        <Ionicons name="football" size={34} color="#F4F6F8" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: w / 2 - 14, top: h * 0.66 - 6, width: 28, height: 6, borderRadius: 3, backgroundColor: '#000',
        opacity: bob.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.2] }), transform: [{ scaleX: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }] }} />
    </View>
  );
}

/**
 * The account screens' frame: a floodlit pitch hero with the MATCHDAY mark, then the form on a
 * card that rises into place.
 */
export function AuthShell({ kicker, title, subtitle, children, footer, back = true }: {
  kicker?: string; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; back?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const heroH = 230 + (Platform.OS === 'web' ? 0 : insets.top);
  return (
    <Screen edges={['bottom']} padded={false} maxWidth={2000} contentStyle={{ paddingTop: 0 }}>
      <View style={{ marginBottom: -space.xl }}>
        <StadiumHero height={heroH} />
        <View style={{ position: 'absolute', top: (Platform.OS === 'web' ? space.lg : insets.top + space.sm), left: space.lg, right: space.lg,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {back ? (
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back"
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <Ionicons name="chevron-back" size={20} color="#F4F6F8" />
            </Pressable>
          ) : <View style={{ width: 40 }} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: PITCH, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="football" size={15} color="#04130A" />
            </View>
            <Text style={{ color: '#F4F6F8', fontWeight: '800', letterSpacing: 3, fontSize: 14 }}>MATCHDAY</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>
      <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: space.lg, gap: space.lg }}>
        <Rise delay={80}>
          <View style={{ gap: 6 }}>
            {!!kicker && <Text variant="overline" tone="primary" style={{ letterSpacing: 2.5 }}>{kicker}</Text>}
            <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6, color: colors.text }} accessibilityRole="header">{title}</Text>
            {!!subtitle && <Text tone="muted">{subtitle}</Text>}
          </View>
        </Rise>
        <Rise delay={200}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md,
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 }}>
            {children}
          </View>
        </Rise>
        {!!footer && <Rise delay={320}>{footer}</Rise>}
      </View>
    </Screen>
  );
}

/** "Continue with Google": a white pill, like the real thing. */
export function GoogleButton({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel="Continue with Google"
      style={({ pressed }) => ({ height: 52, borderRadius: radius.md, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        borderWidth: 1, borderColor: '#DADCE0', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {busy ? <ActivityIndicator color="#1F1F1F" /> : (
        <>
          <Ionicons name="logo-google" size={18} color="#4285F4" />
          <Text style={{ color: '#1F1F1F', fontWeight: '700', fontSize: 16 }}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

/** A thin divider with words in the middle ("or with email"). */
export function OrDivider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text variant="caption" tone="faint">{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

/** How strong a password is, as four segments that fill and colour in. */
export function passwordScore(p: string) {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[a-z]/i.test(p) && /\d/.test(p)) score++;
  if (p.length >= 12) score++;
  if (/[^a-z0-9]/i.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score++;
  return score;
}
export function PasswordStrength({ value }: { value: string }) {
  const { colors } = useTheme();
  const score = passwordScore(value);
  if (!value) return null;
  const tone = [colors.danger, colors.danger, colors.warning, PITCH, PITCH][score];
  const label = ['Too short', 'Weak', 'Good', 'Strong', 'Excellent'][score];
  return (
    <View style={{ gap: 6, marginTop: -space.xs }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < score ? tone : colors.border }} />)}
      </View>
      <Text variant="caption" style={{ color: tone }}>{label}</Text>
    </View>
  );
}
