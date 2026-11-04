import React, { forwardRef } from 'react';
import { View, type HostInstance } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui';
import { formatDate } from '@/domain/format';
import { radius, space } from '@/theme/tokens';

export interface ResultCardData {
  name: string;
  groupName?: string | null;
  date: string;
  formatSize: number;
  fixtures: { number: number; a: string; b: string; scoreA: number | null; scoreB: number | null }[];
  motm: string[];
  topScorers: { name: string; goals: number }[];
  topAssists?: { name: string; assists: number }[];
  /** the sharer's own game, when they played */
  me?: { rating: number | null; goals: number; assists: number; motm: boolean } | null;
}

const WHITE = '#F4F6F8';
const MUTED = '#9FB3A8';
const GREEN = '#22C55E';
const GOLD = '#F5B014';

/** Branded match report graphic for sharing in the group chat. */
export const ResultCard = forwardRef<HostInstance, { data: ResultCardData }>(function ResultCard({ data }, ref) {
  const played = data.fixtures.filter((f) => f.scoreA !== null && f.scoreB !== null);
  const multi = played.length > 1;
  const aggA = played.reduce((n, f) => n + (f.scoreA ?? 0), 0);
  const aggB = played.reduce((n, f) => n + (f.scoreB ?? 0), 0);
  const a = data.fixtures[0]?.a ?? 'Team A';
  const b = data.fixtures[0]?.b ?? 'Team B';
  const me = data.me;
  return (
    <View ref={ref} collapsable={false} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0A0F0C' }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs><LinearGradient id="r" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#14462B" /><Stop offset="1" stopColor="#0A0F0C" /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#r)" />
        {/* faint pitch markings */}
        <Line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
      </Svg>
      <View style={{ padding: space.xl, gap: space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="overline" color={GREEN}>Full time · {data.formatSize}-a-side</Text>
          <Text variant="caption" color={MUTED}>{formatDate(data.date)}</Text>
        </View>
        <View>
          <Text variant="h2" color={WHITE} numberOfLines={1}>{data.name}</Text>
          {!!data.groupName && data.groupName !== data.name && <Text variant="caption" color={MUTED}>{data.groupName}</Text>}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm }}>
          <Text variant="h3" color={WHITE} style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{a}</Text>
          <Text color={WHITE} style={{ width: 120, textAlign: 'center', fontSize: 40, lineHeight: 46, fontWeight: '800' }}>
            {played.length ? `${multi ? aggA : played[0].scoreA}–${multi ? aggB : played[0].scoreB}` : 'vs'}
          </Text>
          <Text variant="h3" color={WHITE} style={{ flex: 1 }} numberOfLines={1}>{b}</Text>
        </View>
        {multi && (
          <View style={{ gap: 2, marginTop: -space.sm }}>
            <Text variant="caption" color={MUTED} align="center">Aggregate over {played.length} games</Text>
            <Text variant="caption" color={MUTED} align="center">{played.map((f) => `${f.scoreA}–${f.scoreB}`).join('  ·  ')}</Text>
          </View>
        )}

        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
        {data.motm.length > 0 && (
          <Text variant="bodyStrong" color={GOLD}>★  Man of the Match: {data.motm.join(' & ')}</Text>
        )}
        {data.topScorers.length > 0 && (
          <Text variant="small" color="#D6E2DB">⚽  {data.topScorers.map((s) => `${s.name}${s.goals > 1 ? ` ×${s.goals}` : ''}`).join(', ')}</Text>
        )}
        {!!data.topAssists?.length && (
          <Text variant="small" color="#D6E2DB">🅰️  {data.topAssists.map((s) => `${s.name}${s.assists > 1 ? ` ×${s.assists}` : ''}`).join(', ')}</Text>
        )}
        {!!me && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(34,197,94,0.12)' }}>
            <Text variant="overline" color={GREEN}>My game</Text>
            <Text variant="bodyStrong" color={WHITE} style={{ flex: 1 }} numberOfLines={1}>
              {[me.rating !== null ? `${me.rating.toFixed(1)} rating` : null, me.goals ? `${me.goals} ${me.goals === 1 ? 'goal' : 'goals'}` : null,
                me.assists ? `${me.assists} ${me.assists === 1 ? 'assist' : 'assists'}` : null, me.motm ? 'MOTM ★' : null].filter(Boolean).join(' · ') || 'Played'}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="overline" color={GREEN} style={{ letterSpacing: 2 }}>MATCHDAY</Text>
          <Text variant="caption" color={MUTED}>matchdayapp.org</Text>
        </View>
      </View>
    </View>
  );
});
