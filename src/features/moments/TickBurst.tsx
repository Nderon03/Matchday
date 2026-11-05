import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';
const DOTS = 8;

/** A tick that pops in with a small burst of dots around it. Plays once when mounted. */
export function TickBurst({ size = 56, colour, icon = 'checkmark' }: { size?: number; colour?: string; icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap }) {
  const { colors, reduceMotion } = useTheme();
  const c = colour ?? colors.primary;
  const [pop] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [burst] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: native }),
      Animated.timing(burst, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
    ]).start();
  }, [pop, burst, reduceMotion]);
  const r = size * 0.95;
  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!reduceMotion && Array.from({ length: DOTS }, (_, i) => {
        const a = (i / DOTS) * Math.PI * 2;
        return (
          <Animated.View key={i} style={{
            position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: i % 2 ? c : colors.gold,
            opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * r] }) },
              { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * r] }) },
              { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
            ],
          }} />
        );
      })}
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center',
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }], opacity: pop.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }) }}>
        <Ionicons name={icon} size={size * 0.55} color={colors.onPrimary} />
      </Animated.View>
    </View>
  );
}
