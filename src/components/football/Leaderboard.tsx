import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, Card, EmptyState, ErrorState, Row, SkeletonList, SwipeSelect, Text } from '@/components/ui';
import { Podium } from './Podium';
import { useLeaderboard } from '@/hooks/queries';
import { CATEGORIES, formatValue, type LeaderboardCategory } from '@/domain/leaderboard';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { Season } from '@/types/db';
import { RankChangePill, useRankChange } from '@/features/moments/RankChange';
import { plural } from '@/domain/format';

export function Leaderboard({ scope, groupId, seasons, minAppearances }: { scope: 'group' | 'friends' | 'global'; groupId?: string; seasons?: Season[]; minAppearances?: number }) {
  const { colors } = useTheme();
  const [category, setCategory] = useState<LeaderboardCategory>('goals');
  const [period, setPeriod] = useState<'all' | 'month' | 'year'>('all');
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const lb = useLeaderboard({ category, scope, groupId, seasonId, period: seasonId ? 'all' : period });
  const all = lb.data?.pages.flat() ?? [];
  const rows = all.filter((r) => r.qualified);
  const pending = all.filter((r) => !r.qualified);
  const me = rows.find((r) => r.is_me);
  // has my position moved since I last looked at this exact table?
  const delta = useRankChange(`${scope}.${groupId ?? ''}.${seasonId ?? period}.${category}`, lb.isFetching ? null : me?.rank);
  const unitOne = category === 'win_pct' ? 'appearance' : category === 'rating' || category === 'form' || category === 'improved' ? 'rated session' : 'game';
  const units = (n: number) => plural(n, unitOne);
  const fmt = (v: number) => formatValue(category, v);
  const def = CATEGORIES.find((c) => c.key === category)!;

  return (
    <View style={{ gap: space.md }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <SwipeSelect compact label="Stat" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.key, label: c.short }))} />
        <SwipeSelect compact label="When" value={seasonId ?? period} onChange={(v) => {
          if (v === 'all' || v === 'month' || v === 'year') { setSeasonId(null); setPeriod(v); } else setSeasonId(v);
        }} options={[
          { value: 'all', label: 'All time' }, { value: 'month', label: 'This month' }, { value: 'year', label: 'This year' },
          ...(seasons ?? []).map((s2) => ({ value: s2.id, label: s2.name })),
        ]} />
      </Row>
      <Text variant="h3">{def.label}</Text>
      {(category === 'win_pct') && <Text variant="caption" tone="muted">Minimum {plural(minAppearances ?? 5, 'appearance')} to qualify.</Text>}
      {(category === 'rating' || category === 'form') && <Text variant="caption" tone="muted">Minimum 3 rated sessions. Every session counts equally.</Text>}
      {category === 'ga' && <Text variant="caption" tone="muted">Goals and assists added together: every goal you score or set up.</Text>}
      {category === 'improved' && <Text variant="caption" tone="muted">Recent-half average minus early-half average (min. 6 rated sessions).</Text>}

      {!!lb.isLoading && <SkeletonList rows={6} />}
      {!!lb.error && <ErrorState error={lb.error} onRetry={lb.refetch} compact />}
      {!!lb.data && all.length === 0 && <EmptyState icon="podium-outline" title="No results yet" message="Play some games — the table fills up as results are finalised." />}
      {!!lb.data && rows.length === 0 && pending.length > 0 && (
        <Card variant="alt"><Text variant="small">Nobody has reached {units(pending[0].needed)} yet, so there’s no official ranking. Here’s how everyone is getting on:</Text></Card>
      )}
      {rows.length > 0 && (
        <>
          <Podium rows={rows.slice(0, 3)} format={fmt} onPress={(r) => router.push(`/player/${r.user_id}`)} />
          {!!me && me.rank != null && me.rank > 3 && (
            <Card variant="highlight" padded={false}>
              <Row gap={space.md} style={{ padding: space.md }}>
                <Text variant="statSmall" tone="primary" style={{ width: 36 }}>#{me.rank}</Text>
                <Text variant="bodyStrong" style={{ flex: 1 }}>You</Text>
                <RankChangePill delta={delta} />
                <Text variant="caption" tone="muted">{plural(me.appearances, 'app')}</Text>
                <Text variant="statSmall">{fmt(me.value)}</Text>
              </Row>
            </Card>
          )}
          <Card padded={false}>
            {rows.map((r, i) => (
              <Row key={r.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: r.is_me ? colors.primaryMuted : 'transparent' }}>
                <View style={{ width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: r.rank! <= 3 ? `${[colors.gold, colors.silver, colors.bronze][r.rank! - 1]}26` : 'transparent' }}>
                  <Text variant="smallStrong" color={r.rank! <= 3 ? [colors.gold, colors.silver, colors.bronze][r.rank! - 1] : colors.textMuted}>{r.rank}</Text>
                </View>
                <Avatar uri={r.avatar_url} name={r.display_name} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1} onPress={() => router.push(`/player/${r.user_id}`)}>{r.display_name}{r.is_me ? ' (you)' : ''}</Text>
                  <Text variant="caption" tone="muted">{plural(r.appearances, 'app')}</Text>
                </View>
                {r.is_me && <RankChangePill delta={delta} />}
                <Text variant="statSmall">{fmt(r.value)}</Text>
              </Row>
            ))}
          </Card>
        </>
      )}
      {pending.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Text variant="overline" tone="muted">Not qualified yet · needs {units(pending[0].needed)}</Text>
          <Card padded={false}>
            {pending.map((r, i) => (
              <Row key={r.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: r.is_me ? colors.primaryMuted : 'transparent' }}>
                <Avatar uri={r.avatar_url} name={r.display_name} size={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1} onPress={() => router.push(`/player/${r.user_id}`)}>{r.display_name}{r.is_me ? ' (you)' : ''}</Text>
                  <Text variant="caption" tone="muted">{r.progress} of {units(r.needed)}</Text>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, marginTop: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, (100 * r.progress) / Math.max(1, r.needed))}%`, height: 4, backgroundColor: colors.primary }} />
                  </View>
                </View>
                <Text variant="statSmall" tone="faint">{fmt(r.value)}</Text>
              </Row>
            ))}
          </Card>
        </View>
      )}
      {!!lb.hasNextPage && <Button title="Load more" variant="secondary" loading={lb.isFetchingNextPage} onPress={() => lb.fetchNextPage()} />}
    </View>
  );
}
