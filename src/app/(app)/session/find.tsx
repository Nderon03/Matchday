import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Card, Chip, EmptyState, ErrorState, Header, Input, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { formatKickoff } from '@/domain/format';
import { usePriceLabel } from '@/hooks/useFees';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface PublicGame {
  id: string; name: string; starts_at: string; duration_minutes: number; venue: string | null; location: string | null;
  format_size: number; max_attendance: number; confirmed: number; price_pence: number; payment_mode: 'free' | 'upfront' | 'after';
  host_id: string | null; host_name: string | null; host_avatar: string | null; my_status: string | null;
}

type When = 'any' | 'today' | 'week' | 'weekend';
const WHEN: [When, string][] = [['any', 'Any time'], ['today', 'Today'], ['week', 'Next 7 days'], ['weekend', 'This weekend']];
const FORMATS: [number | null, string][] = [[null, 'Any size'], [5, '5-a-side'], [6, '6-a-side'], [7, '7-a-side'], [8, '8+']];

function range(when: When): [string | null, string | null] {
  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  if (when === 'today') return [null, day(1).toISOString()];
  if (when === 'week') return [null, day(8).toISOString()];
  if (when === 'weekend') {
    const toSat = (6 - now.getDay() + 7) % 7; // Saturday this week (0 if today is Saturday)
    const sat = now.getDay() === 0 ? day(-1) : day(toSat);
    return [sat.toISOString(), new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 2).toISOString()];
  }
  return [null, null];
}

/** Search upcoming Public games anyone can join. */
export default function FindGame() {
  const { colors } = useTheme();
  const price = usePriceLabel();
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState<When>('any');
  const [format, setFormat] = useState<number | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [from, to] = useMemo(() => range(when), [when]);
  const games = useQuery({
    queryKey: ['public-games', query.trim(), when, format, freeOnly],
    queryFn: () => rpc<PublicGame[]>('search_public_sessions', {
      p_query: query.trim() || null, p_from: from, p_to: to, p_format: format, p_free_only: freeOnly, p_limit: 40,
    }),
    staleTime: 30_000,
  });

  return (
    <Screen edges={['top', 'bottom']} maxWidth={720} onRefresh={games.refetch} refreshing={games.isRefetching}>
      <Header title="Find a game" subtitle="Public games you can join" />
      <Input value={query} onChangeText={setQuery} placeholder="Area, venue or game name" icon="search" autoCorrect={false} returnKeyType="search" />
      <Row gap={space.sm} wrap>
        {WHEN.map(([v, label]) => <Chip key={v} label={label} selected={when === v} onPress={() => setWhen(v)} />)}
      </Row>
      <Row gap={space.sm} wrap>
        {FORMATS.map(([v, label]) => <Chip key={label} label={label} selected={format === v} onPress={() => setFormat(v)} />)}
        <Chip label="Free only" selected={freeOnly} onPress={() => setFreeOnly((f) => !f)} />
      </Row>

      {!!games.isLoading && <SkeletonList rows={4} />}
      {!!games.error && <ErrorState error={games.error} onRetry={games.refetch} />}
      {!!games.data && games.data.length === 0 && (
        <EmptyState icon="football-outline" title="No public games found"
          message={query.trim() || when !== 'any' || format || freeOnly ? 'Try a different area or fewer filters.' : 'When hosts make a game Public, it shows up here. Why not host one?'}
          action={{ label: 'Host a game', onPress: () => router.push('/session/new') }} />
      )}
      <View style={{ gap: space.md }}>
        {(games.data ?? []).map((g) => {
          const left = Math.max(0, g.max_attendance - g.confirmed);
          return (
            <Card key={g.id} onPress={() => router.push(`/session/${g.id}`)} accessibilityLabel={`${g.name}, ${formatKickoff(g.starts_at)}`}>
              <View style={{ gap: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="overline" tone="primary">{g.format_size}-a-side</Text>
                  {g.my_status === 'confirmed' ? <Badge label="You're in" tone="success" />
                    : left === 0 ? <Badge label="Full · waiting list" tone="warning" />
                    : <Badge label={`${left} ${left === 1 ? 'space' : 'spaces'} left`} tone="neutral" />}
                </Row>
                <Text variant="h3" numberOfLines={1}>{g.name}</Text>
                <Row gap={6}><Ionicons name="calendar-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted">{formatKickoff(g.starts_at)} · {g.duration_minutes} min</Text></Row>
                {!!(g.venue || g.location) && (
                  <Row gap={6}><Ionicons name="location-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted" numberOfLines={1}>{[g.venue, g.location].filter(Boolean).join(' · ')}</Text></Row>
                )}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={space.sm}>
                    <Avatar uri={g.host_avatar} name={g.host_name ?? 'Host'} size={24} />
                    <Text variant="small" tone="muted">Hosted by {g.host_name ?? 'a host'}</Text>
                  </Row>
                  <Text variant="bodyStrong">{g.payment_mode === 'free' ? 'Free' : price(g.price_pence).total}</Text>
                </Row>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
