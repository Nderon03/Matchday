import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { plural } from '@/domain/format';

export interface Reliability { attended: number; no_shows: number; late_drops: number; pct: number | null }

/** Reliability for several players at once (shown only once someone has 5 commitments). */
export function useReliability(userIds: string[]) {
  const ids = [...new Set(userIds)].sort();
  return useQuery({
    queryKey: ['reliability', ids],
    queryFn: () => rpc<Record<string, Reliability>>('get_reliability', { p_users: ids }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** "96% reliable": green from 90%, amber from 75%, red below. Nothing until there's enough history. */
export function ReliabilityChip({ r, compact }: { r: Reliability | undefined; compact?: boolean }) {
  const { colors } = useTheme();
  if (!r || r.pct === null) return null;
  const tone = r.pct >= 90 ? colors.success : r.pct >= 75 ? colors.warning : colors.danger;
  const missed = r.no_shows + r.late_drops;
  const label = `${r.pct}% reliable`;
  return (
    <View accessible accessibilityLabel={`${label}: turned up ${plural(r.attended, 'time')}, ${plural(r.no_shows, 'no-show')}, ${plural(r.late_drops, 'late drop-out')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${tone}1F` }}>
      <Ionicons name={r.pct >= 90 ? 'shield-checkmark' : 'alert-circle'} size={12} color={tone} />
      <Text variant="caption" style={{ color: tone, fontWeight: '700' }}>{compact ? `${r.pct}%` : label}</Text>
      {!compact && missed > 0 && <Text variant="caption" tone="muted">· {missed} missed</Text>}
    </View>
  );
}
