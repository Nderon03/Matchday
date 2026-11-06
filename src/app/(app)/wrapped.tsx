import React, { useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Avatar, Button, ErrorState, Header, Loading, Row, Screen, SwipeSelect, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { shareViewAsImage } from '@/lib/share';
import { useAuth } from '@/providers/AuthProvider';
import { rating, plural } from '@/domain/format';
import { radius, space } from '@/theme/tokens';
import { ScreenHelp } from '@/features/ScreenHelp';

function periods() {
  const now = new Date();
  const list: { key: string; label: string; from: Date; to: Date }[] = [];
  for (let i = 0; i < 6; i++) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    list.push({ key: `m${i}`, label: from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), from, to });
  }
  list.splice(1, 0, { key: 'y0', label: `${now.getFullYear()}`, from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) });
  list.push({ key: 'y1', label: `${now.getFullYear() - 1}`, from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear(), 0, 1) });
  return list;
}

function Big({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: space.md }}>
      <Text variant="display" color="#F4F6F8">{value}</Text>
      <Text variant="caption" color="#9FB3A8">{label}</Text>
    </View>
  );
}

export default function Wrapped() {
  const { profile } = useAuth();
  const toast = useToast();
  const ps = periods();
  const [key, setKey] = useState('m0');
  const p = ps.find((x) => x.key === key)!;
  const ref = useRef<HostInstance>(null);
  const w = useQuery({ queryKey: ['wrapped', key], queryFn: () => rpc<any>('get_wrapped', { p_from: p.from.toISOString(), p_to: p.to.toISOString() }) });
  const d = w.data;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={560}>
      <Header title="MATCHDAY Wrapped" right={<ScreenHelp id="wrapped" />} />
      <SwipeSelect accessibilityLabel="Period" value={key} onChange={setKey} options={ps.map((x) => ({ value: x.key, label: x.label }))} />
      {!!w.isLoading && <Loading />}
      {!!w.error && <ErrorState error={w.error} onRetry={w.refetch} />}
      {!!d && (
        <>
          <View ref={ref} collapsable={false} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0B1410' }}>
            <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
              <Defs><LinearGradient id="w" x1="0" y1="0" x2="0.4" y2="1"><Stop offset="0" stopColor="#15532F" /><Stop offset="1" stopColor="#090D0B" /></LinearGradient></Defs>
              <Rect width="100%" height="100%" fill="url(#w)" />
            </Svg>
            <View style={{ padding: space.xxl, gap: space.md }}>
              <Row gap={space.md}>
                <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={48} ring="#22C55E" />
                <View>
                  <Text variant="overline" color="#22C55E">MATCHDAY WRAPPED</Text>
                  <Text variant="h2" color="#F4F6F8">{p.label}</Text>
                </View>
              </Row>
              {d.sessions === 0 ? (
                <Text color="#9FB3A8">No verified games in this period. Get out there!</Text>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    <Big value={d.sessions} label="Sessions played" />
                    <Big value={d.goals} label="Goals scored" />
                    <Big value={`${d.wins}-${d.draws}-${d.losses}`} label="Won · drawn · lost" />
                    <Big value={rating(d.rating)} label="Average rating" />
                    <Big value={d.motm} label="MOTM awards" />
                    <Big value={d.best_win_streak} label="Longest win streak" />
                  </View>
                  {!!d.best_performance && (
                    <Text color="#C9D6CF">Best performance: {d.best_performance.name}{d.best_performance.rating ? ` (${rating(d.best_performance.rating)})` : ''}{d.best_performance.goals ? ` · ${plural(d.best_performance.goals, 'goal')}` : ''}</Text>
                  )}
                  {d.teammates?.length > 0 && <Text color="#C9D6CF">Most games with: {d.teammates.map((t: any) => t.display_name).join(', ')}</Text>}
                </>
              )}
              <Text variant="caption" color="#6F8378">Your football. Your squad. Your statistics.</Text>
            </View>
          </View>
          <Button title="Share" icon="share-social-outline" onPress={() => shareViewAsImage(ref, `matchday-wrapped-${key}`, `My MATCHDAY ${p.label}: ${plural(d.sessions, 'session')}, ${plural(d.goals, 'goal')}, ${d.motm} MOTM`).catch(toast.error)} />
        </>
      )}
    </Screen>
  );
}
