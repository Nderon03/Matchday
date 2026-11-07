import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Card, EmptyState, ErrorState, Header, Input, Row, Screen, SkeletonList, SwipeSelect, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { formatKickoff } from '@/domain/format';
import { usePriceLabel } from '@/hooks/useFees';
import { lookupPlace } from '@/lib/postcodes';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

interface PublicGame {
  id: string; name: string; starts_at: string; duration_minutes: number; venue: string | null; location: string | null;
  format_size: number; max_attendance: number; confirmed: number; price_pence: number; payment_mode: 'free' | 'upfront' | 'after';
  host_id: string | null; host_name: string | null; host_avatar: string | null; my_status: string | null;
  postcode: string | null; distance_miles: number | null;
}

const RADII = [1, 3, 5, 10, 25];

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
  // "Near": a postcode, partial postcode or town, looked up once typing pauses
  const [nearText, setNearText] = useState('');
  const [near, setNear] = useState('');
  const [radius, setRadius] = useState(5);
  useEffect(() => {
    const t = setTimeout(() => setNear(nearText.trim()), 600);
    return () => clearTimeout(t);
  }, [nearText]);
  const place = useQuery({ queryKey: ['place', near.toLowerCase()], enabled: near.length >= 2, queryFn: () => lookupPlace(near), staleTime: 3600_000 });
  const center = near.length >= 2 ? place.data ?? null : null;
  const [from, to] = useMemo(() => range(when), [when]);
  const games = useQuery({
    queryKey: ['public-games', query.trim(), when, format, freeOnly, center?.latitude, center?.longitude, radius],
    // wait for the place lookup when someone has typed a location
    enabled: near.length < 2 || !place.isLoading,
    queryFn: () => rpc<PublicGame[]>('search_public_sessions', {
      p_query: query.trim() || null, p_from: from, p_to: to, p_format: format, p_free_only: freeOnly, p_limit: 40,
      p_lat: center?.latitude ?? null, p_lng: center?.longitude ?? null, p_radius_miles: center ? radius : null,
    }),
    staleTime: 30_000,
  });

  return (
    <Screen edges={['top', 'bottom']} maxWidth={720} onRefresh={games.refetch} refreshing={games.isRefetching}>
      <Header title="Find a game" subtitle="Public games you can join" right={<ScreenHelp id="find" />} />
      <Spot id="find.where" style={{ gap: space.md }}>
      <Input label="Near" value={nearText} onChangeText={setNearText} placeholder="Postcode or area, e.g. NW7 or Mill Hill" icon="navigate-outline" autoCorrect={false} autoCapitalize="characters"
        hint={near.length < 2 ? 'Leave empty to see public games everywhere.'
          : place.isLoading ? 'Finding that place…'
          : center ? `Showing games within ${radius} mi of ${center.label}` : 'We couldn’t find that place. Try a postcode like NW7 2EU.'} />
      <Input value={query} onChangeText={setQuery} placeholder="Venue or game name (optional)" icon="search" autoCorrect={false} returnKeyType="search" />
      </Spot>
      <Spot id="find.filters"><Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <SwipeSelect compact label="When" value={when} onChange={setWhen} options={WHEN.map(([v, label]) => ({ value: v, label }))} />
        <SwipeSelect compact label="Size" value={format} onChange={setFormat} options={FORMATS.map(([v, label]) => ({ value: v, label }))} />
      </Row></Spot>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        {!!center && <SwipeSelect compact label="Within" value={radius} onChange={setRadius} options={RADII.map((r) => ({ value: r, label: `${r} mi` }))} />}
        <SwipeSelect compact label="Price" value={freeOnly ? 'free' : 'any'} onChange={(v) => setFreeOnly(v === 'free')}
          options={[{ value: 'any', label: 'Any price' }, { value: 'free', label: 'Free only' }]} />
      </Row>

      {!!games.isLoading && <SkeletonList rows={4} />}
      {!!games.error && <ErrorState error={games.error} onRetry={games.refetch} />}
      {!!games.data && games.data.length === 0 && (
        <EmptyState icon="football-outline" title="No public games found"
          message={center ? `Nothing within ${radius} mi yet. Try a bigger radius or fewer filters.` : query.trim() || when !== 'any' || format || freeOnly ? 'Try a different area or fewer filters.' : 'When hosts make a game Public, it shows up here. Why not host one?'}
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
                <Text variant="h3" numberOfLines={2}>{g.name}</Text>
                <Row gap={6}><Ionicons name="calendar-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted">{formatKickoff(g.starts_at)} · {g.duration_minutes} min</Text></Row>
                {!!(g.venue || g.location || g.postcode) && (
                  <Row gap={6}>
                    <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                    <Text variant="small" tone="muted" numberOfLines={2} style={{ flex: 1 }}>{[g.venue, g.location, g.postcode].filter(Boolean).join(' · ')}</Text>
                    {g.distance_miles != null && <Text variant="smallStrong" tone="primary">{g.distance_miles < 0.1 ? 'here' : `${g.distance_miles.toFixed(1)} mi`}</Text>}
                  </Row>
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
