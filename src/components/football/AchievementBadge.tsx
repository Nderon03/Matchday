import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { TIERS, type AchievementTier } from '@/domain/achievements';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';

/**
 * Round medal for an achievement. Unlocked: tier-coloured with a soft glow (and a light sweep on
 * rare and above). Locked: muted, with a progress ring showing how close the player is.
 */
export function AchievementBadge({ icon, tier, unlocked, progress = 0, target = 1, size = 56, shine = true }: {
  icon: string;
  tier: AchievementTier;
  unlocked: boolean;
  progress?: number;
  target?: number;
  size?: number;
  shine?: boolean;
}) {
  const { colors, reduceMotion } = useTheme();
  const colour = TIERS[tier].colour;
  const stroke = Math.max(3, Math.round(size / 16));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = unlocked ? 1 : Math.max(0, Math.min(1, target ? progress / target : 0));
  const [sweep] = useState(() => new Animated.Value(0));
  const sweeps = unlocked && shine && tier !== 'common' && !reduceMotion;

  useEffect(() => {
    if (!sweeps) return;
    // a quick light sweep, then a long pause, so it catches the eye without being busy
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(600 + Math.random() * 2400),
      Animated.timing(sweep, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: native }),
      Animated.delay(4000),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sweeps, sweep]);

  const inner = size - stroke * 2 - 6;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={unlocked ? colour : colors.border} strokeOpacity={unlocked ? 0.35 : 1} strokeWidth={stroke} fill="none" />
        {pct > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colour} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - pct)} opacity={unlocked ? 1 : 0.8} />
        )}
      </Svg>
      <View style={{
        width: inner, height: inner, borderRadius: inner / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        backgroundColor: unlocked ? `${colour}2E` : colors.surfaceAlt,
      }}>
        <Ionicons name={(unlocked ? icon : 'lock-closed') as any} size={Math.round(inner * (unlocked ? 0.5 : 0.4))} color={unlocked ? colour : colors.textFaint} />
        {sweeps && (
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: -inner * 0.2, bottom: -inner * 0.2, width: inner * 0.28, backgroundColor: 'rgba(255,255,255,0.28)',
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-inner, inner] }) }, { rotate: '20deg' }],
          }} />
        )}
      </View>
    </View>
  );
}
