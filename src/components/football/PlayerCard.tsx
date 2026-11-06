import React, { forwardRef } from 'react';
import { View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import { POSITION_LABEL, rating } from '@/domain/format';
import { cardStyle } from '@/domain/achievements';
import { Ionicons } from '@expo/vector-icons';
import { ClubShield, Flag } from './Identity';
import { CardFX } from './CardFX';

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
  nationality?: string | null;
  supported_club?: string | null;
  /** turned-up rate, once known (5+ commitments) */
  reliability?: { pct: number | null; attended: number } | null;
}

/** 100% earns its own mark, but only after enough games for it to mean something. */
export const PERFECT_RELIABILITY_GAMES = 10;

function ReliabilityMark({ r, accent, muted }: { r: PlayerCardData['reliability']; accent: string; muted: string }) {
  if (!r || r.pct === null || r.pct < 90) return null;
  if (r.pct === 100 && r.attended >= PERFECT_RELIABILITY_GAMES) {
    return (
      <View accessible accessibilityLabel={`100% reliable over ${r.attended} games`} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
        <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#F5C542' }}>
          <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
            <Defs>
              <LinearGradient id="perfect" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#3A2A06" />
                <Stop offset="0.5" stopColor="#6B4E0E" />
                <Stop offset="1" stopColor="#3A2A06" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#perfect)" />
          </Svg>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Ionicons name="shield-checkmark" size={13} color="#F5C542" />
            <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.8, color: '#FDE68A' }}>100% RELIABLE</Text>
            <Ionicons name="star" size={9} color="#F5C542" />
          </View>
        </View>
        <Text variant="caption" color="#E9D9A6" numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>Always turns up</Text>
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={`${r.pct}% reliable`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <Ionicons name="shield-checkmark" size={12} color={accent} />
      <Text variant="caption" color={muted}>Reliable · {r.pct}%</Text>
    </View>
  );
}

/** Shareable branded player card, in the player's chosen card style. */
export const PlayerCard = forwardRef<HostInstance, { data: PlayerCardData }>(function PlayerCard({ data }, ref) {
  const st = cardStyle(data.card_style);
  // earned styles wear their name at the top
  const label = st.label ?? (st.base ? undefined : st.name.toUpperCase());
  const s = data.stats;
  const cells: [string, string | number][] = [
    // no stats (private profile) shows dashes rather than misleading zeros
    ['Games', s ? s.sessions : '–'], ['Wins', s ? s.wins : '–'], ['Win %', s ? `${Number(s.win_pct).toFixed(0)}%` : '–'], ['MOTM', s ? s.motm : '–'],
    ['Goals', s ? s.goals : '–'], ['Assists', s ? s.assists : '–'], ['G/A', s ? s.goals + s.assists : '–'], ['Medals', data.achievements ?? 0],
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
      <CardFX st={st} radius={radius.xl} />
      {st.id === 'hall_of_fame' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: radius.xl - 4, borderWidth: 1, borderColor: `${st.accent}55` }} />
      )}
      <View style={{ padding: space.xl, gap: space.lg }}>
        {!!label && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: -space.sm }}>
            <Ionicons name="star" size={12} color={st.accent} />
            <Text variant="overline" color={st.accent} style={{ letterSpacing: 3 }}>{label}</Text>
            <Ionicons name="star" size={12} color={st.accent} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="display" color="#F4F6F8" style={{ fontSize: 44, lineHeight: 48 }}>{rating(s?.rating)}</Text>
            <Text variant="overline" color={st.accent}>{data.position === 'ANY' ? 'ALL' : data.position}</Text>
            {(!!data.nationality || !!data.supported_club) && (
              <View style={{ alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Flag code={data.nationality} height={14} />
                {!!data.supported_club && <ClubShield club={data.supported_club} size={24} />}
              </View>
            )}
          </View>
          <Avatar uri={data.avatar_url} name={data.display_name} size={84} ring={st.accent} />
          <View style={{ flex: 1 }}>
            <Text variant="h2" color="#F4F6F8" numberOfLines={1}>{data.display_name}</Text>
            <Text variant="small" color={st.muted} numberOfLines={1}>@{data.username}</Text>
            <Text variant="caption" color={st.muted}>{POSITION_LABEL[data.position] ?? data.position}</Text>
            <ReliabilityMark r={data.reliability} accent={st.accent} muted={st.muted} />
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
