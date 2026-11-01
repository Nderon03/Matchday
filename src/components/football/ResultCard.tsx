import React, { forwardRef } from 'react';
import { View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui';
import { formatDate } from '@/domain/format';
import { radius, space } from '@/theme/tokens';

export interface ResultCardData {
  name: string;
  date: string;
  formatSize: number;
  fixtures: { number: number; a: string; b: string; scoreA: number | null; scoreB: number | null }[];
  motm: string[];
  topScorers: { name: string; goals: number }[];
}

/** Branded match-result graphic (results + MOTM) for sharing. */
export const ResultCard = forwardRef<HostInstance, { data: ResultCardData }>(function ResultCard({ data }, ref) {
  return (
    <View ref={ref} collapsable={false} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0B1410' }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs><LinearGradient id="r" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#123D26" /><Stop offset="1" stopColor="#0A0F0C" /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#r)" />
      </Svg>
      <View style={{ padding: space.xl, gap: space.md }}>
        <Text variant="overline" color="#22C55E">FULL TIME · {data.formatSize}-A-SIDE</Text>
        <Text variant="h2" color="#F4F6F8">{data.name}</Text>
        <Text variant="caption" color="#9FB3A8">{formatDate(data.date)}</Text>
        {data.fixtures.map((f) => (
          <View key={f.number} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="bodyStrong" color="#F4F6F8" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{f.a}</Text>
            <Text variant="h2" color="#F4F6F8" style={{ width: 96, textAlign: 'center' }}>{f.scoreA}–{f.scoreB}</Text>
            <Text variant="bodyStrong" color="#F4F6F8" style={{ flex: 1 }} numberOfLines={1}>{f.b}</Text>
          </View>
        ))}
        {data.motm.length > 0 && <Text variant="bodyStrong" color="#E8B931">★ Man of the Match: {data.motm.join(' & ')}</Text>}
        {data.topScorers.length > 0 && <Text variant="small" color="#C9D6CF">⚽ {data.topScorers.map((s) => `${s.name} ${s.goals}`).join(' · ')}</Text>}
        <Text variant="overline" color="#22C55E">MATCHDAY</Text>
      </View>
    </View>
  );
});
