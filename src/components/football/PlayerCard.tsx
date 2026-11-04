import React, { forwardRef } from 'react';
import { View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import { POSITION_LABEL, rating } from '@/domain/format';
import { cardStyle } from '@/domain/achievements';
import { Ionicons } from '@expo/vector-icons';

export interface PlayerCardData {
  display_name: string;
  username: string;
  avatar_url: string | null;
  position: string;
  stats?: { rating: number | null; sessions: number; fixtures: number; wins: number; losses: number; win_pct: number; goals: number; assists: number; motm: number } | null;
  /** medal points (shown as Medals) */
  achievements?: number;
  /** card style id unlocked with medal points */
  card_style?: string | null;
}

/** Shareable branded player card, in the player's chosen card style. */
export const PlayerCard = forwardRef<HostInstance, { data: PlayerCardData }>(function PlayerCard({ data }, ref) {
  const st = cardStyle(data.card_style);
  const s = data.stats;
  const cells: [string, string | number][] = [
    ['Games', s?.sessions ?? 0], ['Wins', s?.wins ?? 0], ['Losses', s?.losses ?? 0], ['Win %', s ? `${Number(s.win_pct).toFixed(0)}%` : '–'],
    ['Goals', s?.goals ?? 0], ['Assists', s?.assists ?? 0], ['MOTM', s?.motm ?? 0], ['Medals', data.achievements ?? 0],
  ];
  return (
    <View ref={ref} collapsable={false} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: st.to, borderWidth: st.border ? (st.id === 'hall_of_fame' ? 2 : 1) : 0, borderColor: st.border ?? undefined }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={st.from} />
            <Stop offset="1" stopColor={st.to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
      </Svg>
      {st.id === 'hall_of_fame' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: radius.xl - 4, borderWidth: 1, borderColor: `${st.accent}55` }} />
      )}
      <View style={{ padding: space.xl, gap: space.lg }}>
        {!!st.label && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: -space.sm }}>
            <Ionicons name="star" size={12} color={st.accent} />
            <Text variant="overline" color={st.accent} style={{ letterSpacing: 3 }}>{st.label}</Text>
            <Ionicons name="star" size={12} color={st.accent} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="display" color="#F4F6F8" style={{ fontSize: 44, lineHeight: 48 }}>{rating(s?.rating)}</Text>
            <Text variant="overline" color={st.accent}>{data.position === 'ANY' ? 'ALL' : data.position}</Text>
          </View>
          <Avatar uri={data.avatar_url} name={data.display_name} size={84} ring={st.accent} />
          <View style={{ flex: 1 }}>
            <Text variant="h2" color="#F4F6F8" numberOfLines={1}>{data.display_name}</Text>
            <Text variant="small" color={st.muted} numberOfLines={1}>@{data.username}</Text>
            <Text variant="caption" color={st.muted}>{POSITION_LABEL[data.position] ?? data.position}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
          {cells.map(([label, value]) => (
            <View key={label} style={{ width: '25%', alignItems: 'center' }}>
              <Text variant="statSmall" color="#F4F6F8">{value}</Text>
              <Text variant="caption" color={st.muted}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="overline" color={st.accent}>MATCHDAY</Text>
          <Text variant="caption" color={st.muted} style={{ opacity: 0.75 }}>Your football. Your squad. Your statistics.</Text>
        </View>
      </View>
    </View>
  );
});
