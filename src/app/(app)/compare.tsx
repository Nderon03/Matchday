import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, Chip, ErrorState, Header, Loading, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useFriends } from '@/hooks/queries';
import { formatDate, rating } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

function Bar({ label, a, b, format = (v: number) => String(v) }: { label: string; a: number; b: number; format?: (v: number) => string }) {
  const { colors } = useTheme();
  const total = Math.max(a + b, 0.0001);
  const aWins = a > b;
  const bWins = b > a;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${format(a)} versus ${format(b)}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="statSmall" tone={aWins ? 'primary' : 'default'}>{format(a)}</Text>
        <Text variant="caption" tone="muted">{label}</Text>
        <Text variant="statSmall" tone={bWins ? 'primary' : 'default'}>{format(b)}</Text>
      </Row>
      <View style={{ flexDirection: 'row', height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
        <View style={{ flex: a / total || 0.0001, backgroundColor: aWins ? colors.primary : colors.borderStrong }} />
        <View style={{ flex: b / total || 0.0001, backgroundColor: bWins ? colors.primary : colors.borderStrong }} />
      </View>
    </View>
  );
}

export default function Compare() {
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const { userId, profile } = useAuth();
  const friends = useFriends();
  const [b, setB] = useState<string | undefined>(params.b);
  const a = params.a ?? userId!;
  const h2h = useQuery({ queryKey: ['h2h', a, b], enabled: !!b, queryFn: () => rpc<any>('get_head_to_head', { p_a: a, p_b: b }) });
  const other = friends.data?.friends.find((f) => f.id === b);
  const d = h2h.data;
  const ca = d?.a ?? {};
  const cb = d?.b ?? {};
  const n = (v: any) => Number(v ?? 0);

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="Head to head" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {friends.data?.friends.map((f) => <Chip key={f.id} label={f.display_name} selected={b === f.id} onPress={() => setB(f.id)} />)}
      </ScrollView>
      {!b && <Text tone="muted">Pick a friend to compare with.</Text>}
      {b && h2h.isLoading && <Loading />}
      {h2h.error && <ErrorState error={h2h.error} onRetry={h2h.refetch} />}
      {d && (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={64} />
                <Text variant="bodyStrong">{a === userId ? 'You' : 'Player A'}</Text>
              </View>
              <Text variant="h2" tone="faint">VS</Text>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Avatar uri={other?.avatar_url} name={other?.display_name} size={64} />
                <Text variant="bodyStrong">{other?.display_name ?? 'Player B'}</Text>
              </View>
            </Row>
          </Card>
          <SectionTitle title="Career" />
          <Card>
            <View style={{ gap: space.lg }}>
              <Bar label="Avg rating" a={n(ca.rating)} b={n(cb.rating)} format={(v) => rating(v)} />
              <Bar label="Recent form" a={n(d.a_form)} b={n(d.b_form)} format={(v) => rating(v)} />
              <Bar label="Appearances" a={n(ca.sessions)} b={n(cb.sessions)} />
              <Bar label="Wins" a={n(ca.wins)} b={n(cb.wins)} />
              <Bar label="Losses" a={n(ca.losses)} b={n(cb.losses)} />
              <Bar label="Win %" a={n(ca.win_pct)} b={n(cb.win_pct)} format={(v) => `${v.toFixed(0)}%`} />
              <Bar label="Goals" a={n(ca.goals)} b={n(cb.goals)} />
              <Bar label="Assists" a={n(ca.assists)} b={n(cb.assists)} />
              <Bar label="MOTM" a={n(ca.motm)} b={n(cb.motm)} />
            </View>
          </Card>
          <SectionTitle title="Rivalry · on opposite teams" />
          <Card>
            {d.rivalry.games === 0 ? <Text tone="muted">You haven’t faced each other yet.</Text> : (
              <View style={{ gap: space.md }}>
                <Row style={{ justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center' }}><Text variant="stat" tone="primary">{d.rivalry.a_wins}</Text><Text variant="caption" tone="muted">Your wins</Text></View>
                  <View style={{ alignItems: 'center' }}><Text variant="stat">{d.rivalry.draws}</Text><Text variant="caption" tone="muted">Draws</Text></View>
                  <View style={{ alignItems: 'center' }}><Text variant="stat">{d.rivalry.b_wins}</Text><Text variant="caption" tone="muted">Their wins</Text></View>
                </Row>
                <Text variant="small" tone="muted" align="center">Goals in those sessions: {d.rivalry.a_goals} – {d.rivalry.b_goals}</Text>
                {d.rivalry.last && <Text variant="small" tone="muted" align="center">Last met: {d.rivalry.last.name}, {formatDate(d.rivalry.last.played_at)} ({d.rivalry.last.a_score}–{d.rivalry.last.b_score})</Text>}
              </View>
            )}
          </Card>
          <Text variant="small" tone="muted">As teammates: {d.teammates.games} games, {d.teammates.wins} wins.</Text>
        </>
      )}
    </Screen>
  );
}
