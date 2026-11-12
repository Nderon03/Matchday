import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { fonts } from '@/theme/tokens';
import { parseSeasonBadge } from '@/domain/seasonBadges';

/** The hexagon emblem: the season ("S1", "PRE") on the tier's colours, with the tier's icon for the top tiers. */
export function SeasonEmblem({ code, size = 36 }: { code: string; size?: number }) {
  const b = parseSeasonBadge(code);
  if (!b) return null;
  const { colour, fill } = b.info;
  const top = b.tier === 'champion' || b.tier === 'elite';
  const id = `sb-${code}`;
  return (
    <View style={{ width: size, height: size * 1.1, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size * 1.1} viewBox="0 0 40 44" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fill} stopOpacity="0.85" />
            <Stop offset="1" stopColor={fill} />
          </LinearGradient>
        </Defs>
        <Path d="M20 1.5 L37.5 11.5 L37.5 32.5 L20 42.5 L2.5 32.5 L2.5 11.5 Z" fill={`url(#${id})`} stroke={colour} strokeWidth={b.tier === 'champion' ? 2.6 : 1.8} />
        {top && <Path d="M20 6 L33.5 13.8 L33.5 30.2 L20 38 L6.5 30.2 L6.5 13.8 Z" fill="none" stroke={colour} strokeWidth={0.7} opacity={0.6} />}
      </Svg>
      {top && <Ionicons name={b.info.icon} size={size * 0.22} color={colour} style={{ marginBottom: -1 }} />}
      <Text style={{ fontFamily: fonts.score, fontSize: size * (b.short.length > 2 ? 0.26 : 0.34), lineHeight: size * 0.4, color: colour, letterSpacing: 0.5 }}>{b.short}</Text>
    </View>
  );
}

/**
 * A tiny rank pip for the corner of a player's photo in lists, team sheets and the pitch: the tier's
 * colours and icon. Sized from the photo, so it scales with it.
 */
export function SeasonPip({ code, avatar }: { code: string | null | undefined; avatar: number }) {
  const b = parseSeasonBadge(code);
  if (!b) return null;
  const size = Math.max(14, Math.round(avatar * 0.42));
  return (
    <View pointerEvents="none" accessible accessibilityLabel={b.label}
      style={{ position: 'absolute', top: -size * 0.28, right: -size * 0.28, width: size, height: size * 1.1, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size * 1.1} viewBox="0 0 40 44" style={{ position: 'absolute' }}>
        <Path d="M20 1.5 L37.5 11.5 L37.5 32.5 L20 42.5 L2.5 32.5 L2.5 11.5 Z" fill={b.info.fill} stroke={b.info.colour} strokeWidth={3.2} />
      </Svg>
      <Ionicons name={b.info.icon} size={size * 0.5} color={b.info.colour} />
    </View>
  );
}
