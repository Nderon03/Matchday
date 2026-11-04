import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Row, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

/** Weeks in a row with a game. The flame gently breathes while the streak is alive. */
export function StreakCard({ current, best }: { current: number; best: number }) {
  const { colors } = useTheme();
  return (
    <Card>
      <Row gap={space.md}>
        <StreakFlame active={current > 0} size={30} />
        <View style={{ flex: 1 }}>
          <Text variant="h3">{current > 0 ? `${current}-week streak` : 'No streak yet'}</Text>
          <Text variant="small" tone="muted">
            {current > 0 ? 'Weeks in a row with a game. Keep turning up to keep it going.' : 'Play in back-to-back weeks to start a streak.'}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text variant="statSmall" style={{ color: colors.textMuted }}>{best}</Text>
          <Text variant="caption" tone="faint">Best</Text>
        </View>
      </Row>
    </Card>
  );
}

export function StreakFlame({ active, size = 18 }: { active: boolean; size?: number }) {
  const { colors, reduceMotion } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, pulse]);
  return (
    <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }, { rotate: pulse.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) }] }}>
      <Ionicons name={active ? 'flame' : 'flame-outline'} size={size} color={active ? '#F97316' : colors.textFaint} />
    </Animated.View>
  );
}
