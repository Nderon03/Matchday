import React, { forwardRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import { POSITION_LABEL, rating } from '@/domain/format';
import { SEASON_CHAMPION, TRACKS, cardStyle, levelInfo, parseCode } from '@/domain/achievements';
import { AchievementBadge } from './AchievementBadge';
import { cardTitle } from '@/domain/titles';
import { Ionicons } from '@expo/vector-icons';
import { ClubShield, Flag } from './Identity';
import { CardFX, PhotoHalo, PhotoLaurel } from './CardFX';
import { SeasonEmblem } from './SeasonBadge';
import { parseSeasonBadge } from '@/domain/seasonBadges';

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
  /** the title the player picked (id from CARD_TITLES) */
  title?: string | null;
  /** up to five medal codes the player chose to show (e.g. goals_l4) */
  medals?: string[] | null;
  /** turned-up rate, once known (5+ commitments) */
  reliability?: { pct: number | null; attended: number } | null;
}

/** 100% earns its own mark, but only after enough games for it to mean something. */
export const PERFECT_RELIABILITY_GAMES = 10;

function ReliabilityMark({ r, accent, muted, compact }: { r: PlayerCardData['reliability']; accent: string; muted: string; compact?: boolean }) {
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
            <Text numberOfLines={1} style={{ fontSize: compact ? 9 : 10, lineHeight: 13, fontWeight: '800', letterSpacing: compact ? 0.4 : 0.8, color: '#FDE68A' }}>{compact ? '100%' : '100% RELIABLE'}</Text>
            <Ionicons name="star" size={9} color="#F5C542" />
          </View>
        </View>
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

/** Up to five medals a player chose to show along the bottom of the card. */
export const MAX_CARD_MEDALS = 5;
export function CardMedals({ codes, size = 40, labels = true }: { codes: string[]; size?: number; labels?: boolean }) {
  const items = codes.slice(0, MAX_CARD_MEDALS).map((c) => {
    const { track, level } = parseCode(c);
    const def = c === SEASON_CHAMPION.code ? { name: SEASON_CHAMPION.name, icon: SEASON_CHAMPION.icon } : TRACKS.find((t) => t.track === track);
    return def ? { code: c, level, name: def.name, icon: def.icon } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return null;
  return (
    <View accessible accessibilityLabel={`Medals: ${items.map((m) => `${m.name} ${levelInfo(m.level).label}`).join(', ')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: items.length > 3 ? 5 : 8 }}>
      {items.map((m) => (
        <View key={m.code} style={{ alignItems: 'center', gap: 2 }}>
          <AchievementBadge icon={m.icon} level={m.level} size={size} />
          {labels && (
            <Text color={levelInfo(m.level).colour} style={{ fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.6 }}>
              {levelInfo(m.level).label.toUpperCase()}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** Shareable branded player card, in the player's chosen card style. */
export const PlayerCard = forwardRef<HostInstance, { data: PlayerCardData; still?: boolean }>(function PlayerCard({ data, still }, ref) {
  const st = cardStyle(data.card_style);
  // earned styles wear their name at the top
  const label = st.label ?? (st.base ? undefined : st.name.toUpperCase());
  const s = data.stats;
  // the card fits whatever it's given: a small phone, a tablet column or a share image
  const [w, setW] = useState(0);
  const compact = w > 0 && w < 340;
  const roomy = w >= 460;
  // Hall of Fame's wreath needs room round the photo, so its photo is a touch smaller to keep the name in full
  const hof = st.id === 'hall_of_fame';
  const photo = hof ? (compact ? 52 : roomy ? 84 : 66) : compact ? 62 : roomy ? 96 : 84;
  const cells: [string, string | number][] = [
    // no stats (private profile) shows dashes rather than misleading zeros
    ['Matches', s ? s.fixtures : '–'], ['Wins', s ? s.wins : '–'], ['Win %', s ? `${Number(s.win_pct).toFixed(0)}%` : '–'], ['MOTM', s ? s.motm : '–'],
    ['Goals', s ? s.goals : '–'], ['Assists', s ? s.assists : '–'], ['G/A', s ? s.goals + s.assists : '–'], ['Medals', data.achievements ?? 0],
  ];
  return (
    <View ref={ref} collapsable={false} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: st.to, borderWidth: st.border ? (st.fx >= 3 ? 2 : st.fx === 2 ? 1.5 : 1) : 0, borderColor: st.border ?? undefined }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs>
          <LinearGradient id={`card-${st.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={st.from} />
            <Stop offset="1" stopColor={st.to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#card-${st.id})`} />
      </Svg>
      <CardFX st={st} radius={radius.xl} still={still} />

      <View style={{ padding: compact ? space.lg : space.xl, gap: compact ? space.md : space.lg }}>
        {!!label && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: -space.sm }}>
            <Ionicons name={st.icon ?? 'star'} size={st.fx >= 5 ? 14 : 12} color={st.accent} />
            <Text variant="overline" color={st.accent} style={{ letterSpacing: st.fx >= 5 ? 4 : 3 }}>{label}</Text>
            <Ionicons name={st.icon ?? 'star'} size={st.fx >= 5 ? 14 : 12} color={st.accent} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? space.md : space.lg }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="display" color="#F4F6F8" style={{ fontSize: compact ? 42 : 54, lineHeight: compact ? 44 : 56 }}>{rating(s?.rating)}</Text>
            <Text variant="overline" color={st.accent}>{data.position === 'ANY' ? 'ALL' : data.position}</Text>
            {(!!data.nationality || !!data.supported_club) && (
              <View style={{ alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Flag code={data.nationality} height={14} />
                {!!data.supported_club && <ClubShield club={data.supported_club} size={24} />}
              </View>
            )}
          </View>
          {/* the Hall of Fame wreath reaches ~18px past the photo: give it room so it never touches the rating or name */}
          <View style={hof ? { marginHorizontal: compact ? 8 : 10, marginVertical: 10 } : st.id === 'diamond' ? { marginHorizontal: 4 } : undefined}>
            {st.id === 'diamond' && <PhotoHalo size={photo} still={still} />}
            {hof && <PhotoLaurel size={photo} still={still} />}
            <Avatar uri={data.avatar_url} name={data.display_name} size={photo} ring={st.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant={compact ? 'h3' : 'h2'} color="#F4F6F8" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{data.display_name}</Text>
            <Text variant="small" color={st.muted} numberOfLines={1}>@{data.username}</Text>
            <Text variant="caption" color={st.muted} numberOfLines={1}>{POSITION_LABEL[data.position] ?? data.position}</Text>
            <ReliabilityMark r={data.reliability} accent={st.accent} muted={st.muted} compact={compact} />
            {(() => {
              const t = cardTitle(data.title);
              if (!t) return null;
              const titleStyle = { fontSize: 11, lineHeight: 14, fontWeight: '800' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const };
              // a ranked title wears its season badge, in the tier's colour
              const ranked = t.req.kind === 'season' ? parseSeasonBadge(t.req.code) : null;
              if (ranked) {
                return (
                  <View accessible accessibilityLabel={`Title: ${t.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <SeasonEmblem code={ranked.code} size={compact ? 18 : 20} />
                    <Text numberOfLines={1} color={ranked.info.colour} style={[titleStyle, { flexShrink: 1 }]}>{t.label}</Text>
                  </View>
                );
              }
              return <Text numberOfLines={1} color={st.accent} accessibilityLabel={`Title: ${t.label}`} style={[titleStyle, { marginTop: 6 }]}>{t.label}</Text>;
            })()}
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
          {cells.map(([label, value]) => (
            <View key={label} style={{ width: '25%', alignItems: 'center' }}>
              <Text variant="statSmall" color="#F4F6F8" numberOfLines={1} style={compact ? { fontSize: 17, lineHeight: 22 } : undefined}>{value}</Text>
              <Text variant="caption" color={st.muted} numberOfLines={1} style={compact ? { fontSize: 11 } : undefined}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, minHeight: 24, paddingRight: st.base ? 0 : 6 }}>
          <Text variant="overline" color={st.accent}>MATCHDAY</Text>
          {data.medals?.length ? (() => {
            // five fit side by side: a little smaller, and level names only when there's room
            const n = Math.min(MAX_CARD_MEDALS, data.medals.length);
            const sz = n <= 3 ? (compact ? 32 : 40) : compact ? (n === 5 ? 28 : 30) : roomy ? 40 : (n === 5 ? 34 : 36);
            return <CardMedals codes={data.medals} size={sz} labels={n <= 3 || roomy} />;
          })()
            : (
              <Text variant="caption" color={st.muted} numberOfLines={1} style={{ opacity: 0.75, flexShrink: 1, textAlign: 'right' }}>
                {roomy ? 'Your football. Your squad. Your statistics.' : 'Your football. Your squad.'}
              </Text>
            )}
        </View>
      </View>
    </View>
  );
});
