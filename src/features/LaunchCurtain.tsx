import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { StadiumHero } from '@/features/AuthShell';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/**
 * Opening the app: a moment under the floodlights with the MATCHDAY mark, then it lifts away.
 * Short (about a second), and skipped entirely with reduce motion.
 */
export function LaunchCurtain() {
  const { reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const [fade] = useState(() => new Animated.Value(1));
  const [mark] = useState(() => new Animated.Value(0));
  // app only: the website (invite links) opens straight away
  const [gone, setGone] = useState(reduceMotion || Platform.OS === 'web');
  useEffect(() => {
    if (gone) return;
    Animated.sequence([
      Animated.spring(mark, { toValue: 1, friction: 6, tension: 80, useNativeDriver: native }),
      Animated.delay(450),
      Animated.timing(fade, { toValue: 0, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
    ]).start(() => setGone(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once on launch
  }, []);
  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#030806', opacity: fade, zIndex: 1000 }]}>
      <StadiumHero height={height} width={width} fadeTo="#030806" />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={{ alignItems: 'center', gap: 12, marginTop: -height * 0.25, opacity: mark,
          transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="football" size={36} color="#04130A" />
          </View>
          <Text style={{ color: '#F4F6F8', fontWeight: '800', letterSpacing: 6, fontSize: 22 }}>MATCHDAY</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
