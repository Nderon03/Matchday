import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Row, Text } from '@/components/ui';
import { AchievementBadge } from '@/components/football/AchievementBadge';
import { levelInfo, nearlyThere } from '@/domain/achievements';
import type { MyAchievements } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

/** "1 goal from Gold in Goals": a gentle nudge on Home when a medal is one step away. */
export function NearlyThere({ data }: { data: MyAchievements | undefined }) {
  const { colors, reduceMotion } = useTheme();
  const n = data ? nearlyThere(data.items) : null;
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!n || reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [n?.track, n?.level, pulse, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!n) return null;
  const colour = levelInfo(n.level).colour;
  return (
    <Card onPress={() => router.push('/achievements')} accessibilityLabel={`${n.label}. See achievements`} style={{ borderColor: `${colour}66` }}>
      <Row gap={space.md}>
        <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
          <AchievementBadge icon={n.icon} level={n.level - 1} progress={n.progress} target={n.target} size={46} animate={false} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" style={{ color: colour, fontWeight: '700' }}>Nearly there</Text>
          <Text variant="bodyStrong">{n.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Row>
    </Card>
  );
}
