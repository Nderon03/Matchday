import React, { forwardRef } from 'react';
import { View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import { POSITION_LABEL, rating } from '@/domain/format';

export interface PlayerCardData {
  display_name: string;
  username: string;
  avatar_url: string | null;
  position: string;
  stats?: { rating: number | null; sessions: number; fixtures: number; wins: number; losses: number; win_pct: number; goals: number; assists: number; motm: number } | null;
  achievements?: number;
}

/** Shareable branded player card. */
export const PlayerCard = forwardRef<HostInstance, { data: PlayerCardData }>(function PlayerCard({ data }, ref) {
  const { colors } = useTheme();
  const s = data.stats;
  const cells: [string, string | number][] = [
    ['Games', s?.sessions ?? 0], ['Wins', s?.wins ?? 0], ['Losses', s?.losses ?? 0], ['Win %', s ? `${Number(s.win_pct).toFixed(0)}%` : '–'],
    ['Goals', s?.goals ?? 0], ['Assists', s?.assists ?? 0], ['MOTM', s?.motm ?? 0], ['Badges', data.achievements ?? 0],
  ];
  return (
    <View ref={ref} collapsable={false} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0B1410' }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#123D26" />
            <Stop offset="1" stopColor="#0A0F0C" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
      </Svg>
      <View style={{ padding: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="display" color="#F4F6F8" style={{ fontSize: 44, lineHeight: 48 }}>{rating(s?.rating)}</Text>
            <Text variant="overline" color={colors.primary}>{data.position === 'ANY' ? 'ALL' : data.position}</Text>
          </View>
          <Avatar uri={data.avatar_url} name={data.display_name} size={84} ring="#22C55E" />
          <View style={{ flex: 1 }}>
            <Text variant="h2" color="#F4F6F8" numberOfLines={1}>{data.display_name}</Text>
            <Text variant="small" color="#9FB3A8" numberOfLines={1}>@{data.username}</Text>
            <Text variant="caption" color="#9FB3A8">{POSITION_LABEL[data.position] ?? data.position}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
          {cells.map(([label, value]) => (
            <View key={label} style={{ width: '25%', alignItems: 'center' }}>
              <Text variant="statSmall" color="#F4F6F8">{value}</Text>
              <Text variant="caption" color="#9FB3A8">{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="overline" color="#22C55E">MATCHDAY</Text>
          <Text variant="caption" color="#6F8378">Your football. Your squad. Your statistics.</Text>
        </View>
      </View>
    </View>
  );
});
