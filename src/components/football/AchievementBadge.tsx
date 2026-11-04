import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { levelInfo } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/**
 * Round medal for an achievement track. The colour follows the level reached (Bronze → Legend)
 * and higher levels get a little more life: Gold and Platinum catch the light now and then,
 * Legend has a slow glow. Level 0 is an empty medal with a ring showing progress to Bronze.
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
  const earned = level > 0;
  const colour = levelInfo(earned ? level : 1).colour;
  const nextColour = levelInfo(Math.min(5, level + 1)).colour;
  const stroke = Math.max(3, Math.round(size / 16));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = level >= 5 ? 1 : Math.max(0, Math.min(1, target ? progress / target : 0));
  const live = animate && !reduceMotion;
  const [sweep] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!live || level < 3) return;
    // a quick light sweep, then a pause; more often at Platinum and Legend
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(500 + Math.random() * 2000),
      Animated.timing(sweep, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      Animated.delay(level >= 4 ? 1800 : 4500),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live, level, sweep]);

  useEffect(() => {
    if (!live || level < 5) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live, level, glow]);

  const inner = size - stroke * 2 - 6;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {level >= 5 && (
        <Animated.View style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: colour,
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] }),
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.16] }) }],
        }} />
      )}
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={earned ? colour : colors.border} strokeOpacity={earned ? 0.3 : 1} strokeWidth={stroke} fill="none" />
        {pct > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={level >= 5 ? colour : nextColour} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - pct)} />
        )}
      </Svg>
      <View style={{
        width: inner, height: inner, borderRadius: inner / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        backgroundColor: earned ? `${colour}2E` : colors.surfaceAlt,
      }}>
        <Ionicons name={icon as any} size={Math.round(inner * 0.5)} color={earned ? colour : colors.textFaint} style={{ opacity: earned ? 1 : 0.6 }} />
        {live && level >= 3 && (
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: -inner * 0.2, bottom: -inner * 0.2, width: inner * 0.28, backgroundColor: 'rgba(255,255,255,0.3)',
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-inner, inner] }) }, { rotate: '20deg' }],
          }} />
        )}
      </View>
    </View>
  );
}
