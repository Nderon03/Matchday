import React, { useRef, useState } from 'react';
import { Platform, ScrollView, View, type HostInstance } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, Chip, EmptyState, ErrorState, Input, Row, SectionTitle, Sheet, Skeleton, StatGrid, StatTile, Text, useToast } from '@/components/ui';
import { PlayerCard } from '@/components/football/PlayerCard';
import { FormPills, RatingChart } from '@/components/football/FormChart';
import { usePlayerProfile, keys } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc, q } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { shareText, shareViewAsImage } from '@/lib/share';
import { ACHIEVEMENTS } from '@/domain/achievements';
import { formatDate, formatKickoff, POSITION_LABEL, rating } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function PlayerProfileView({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState<string | null>(null);
  const profile = usePlayerProfile(userId, groupId);
  const { run, busy } = useAction([keys.player(userId, groupId), keys.friends]);
  const cardRef = useRef<HostInstance>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const catalogue = useQuery({ queryKey: ['achievements'], queryFn: () => q<any[]>(supabase.from('achievements').select('*').order('sort_order')), staleTime: Infinity });

  if (profile.isLoading) return <View style={{ gap: space.md }}><Skeleton height={220} /><Skeleton height={100} /><Skeleton height={100} /></View>;
  if (!profile.data) return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  const d = profile.data;
  const p = d.profile;
  const s = d.stats;
  const unlocked = new Set((d.achievements ?? []).map((a: any) => a.code));

  const share = async () => {
    try {
      const r = await shareViewAsImage(cardRef, `matchday-${p.username}`, `${p.display_name} on MATCHDAY — rating ${rating(s?.rating)}, ${s?.goals ?? 0} goals, ${s?.motm ?? 0} MOTM`);
      if (r === 'downloaded') toast.success('Player card downloaded');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <PlayerCard ref={cardRef} data={{ ...p, stats: s ? { ...s, rating: s.rating } : null, achievements: d.achievements?.length ?? 0 }} />

      <Row gap={space.sm} wrap>
        {d.is_self ? (
          <>
            <Button title="Share card" icon="share-social-outline" size="sm" onPress={share} />
            <Button title="Edit profile" icon="create-outline" size="sm" variant="secondary" onPress={() => router.push('/settings/profile')} />
            <Button title="Wrapped" icon="sparkles-outline" size="sm" variant="secondary" onPress={() => router.push('/wrapped')} />
          </>
        ) : (
          <>
            {d.is_friend ? (
              <Badge label="Friends" tone="success" />
            ) : d.friend_request?.outgoing ? (
              <Button title="Request sent" size="sm" variant="secondary" disabled />
            ) : d.friend_request ? (
              <Button title="Accept request" icon="checkmark" size="sm" loading={busy === 'accept'} onPress={() => run('accept', () => rpc('respond_friend_request', { p_request: d.friend_request.id, p_accept: true }), 'You’re now friends')} />
            ) : (
              <Button title="Add friend" icon="person-add-outline" size="sm" loading={busy === 'add'} onPress={() => run('add', () => rpc('send_friend_request', { p_target: userId }), 'Friend request sent')} />
            )}
            {!!d.can_view_stats && <Button title="Compare" icon="git-compare-outline" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/compare', params: { b: userId } })} />}
            <Button title="Share card" icon="share-social-outline" size="sm" variant="ghost" onPress={share} />
          </>
        )}
      </Row>

      {!!p.bio && <Text tone="muted">{p.bio}</Text>}
      <Text variant="caption" tone="faint">{POSITION_LABEL[p.position]} · Joined {formatDate(p.created_at)} · {d.friends_count} friends</Text>

      {d.groups.length > 0 && d.can_view_stats && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="Career" selected={!groupId} onPress={() => setGroupId(null)} />
          {d.groups.map((g: any) => <Chip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />)}
        </ScrollView>
      )}

      {!d.can_view_stats ? (
        <Card><EmptyState icon="lock-closed-outline" title="Stats are private" message={`${p.display_name} only shares statistics with friends.`} /></Card>
      ) : !s || s.sessions === 0 ? (
        <Card><EmptyState icon="football-outline" title="No verified games yet" message="Statistics appear once a session is finalised." /></Card>
      ) : (
        <>
          <SectionTitle title={groupId ? 'Group record' : 'Career'} />
          <StatGrid>
            <StatTile label="Avg rating" value={rating(s.rating)} sub={`${s.rated_sessions} rated`} accent />
            <StatTile label="Sessions" value={s.sessions} sub={`${s.fixtures} games`} />
            <StatTile label="Win %" value={`${Number(s.win_pct).toFixed(0)}%`} sub={`${s.wins}W ${s.draws}D ${s.losses}L`} />
            <StatTile label="Goals" value={s.goals} sub={`${(s.goals / Math.max(1, s.sessions)).toFixed(1)} per session`} />
            <StatTile label="Assists" value={s.assists} />
            <StatTile label="MOTM" value={s.motm} />
            <StatTile label="Best rating" value={rating(s.highest_rating)} />
            <StatTile label="Win streak" value={s.current_win_streak} sub={`Best ${s.best_win_streak}`} />
            <StatTile label="Unbeaten" value={s.current_unbeaten} sub={`Best ${s.best_unbeaten}`} />
          </StatGrid>

          <SectionTitle title="Form · last 5" />
          <FormPills ratings={[...(d.form ?? []).map((f: any) => Number(f.rating)), ...Array(Math.max(0, 5 - (d.form?.length ?? 0))).fill(null)]} />

          <SectionTitle title="Rating history" />
          <Card><RatingChart points={(d.rating_history ?? []).map((r: any) => ({ rating: Number(r.rating), played_at: r.played_at }))} /></Card>

          {d.recent_results?.length > 0 && (
            <>
              <SectionTitle title="Recent sessions" />
              <Card padded={false}>
                {d.recent_results.map((r: any, i: number) => (
                  <Row key={r.session_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1} onPress={() => router.push(`/session/${r.session_id}`)}>{r.name}</Text>
                      <Text variant="caption" tone="muted">{formatKickoff(r.played_at)} · {r.wins}W {r.draws}D {r.losses}L{r.goals ? ` · ${r.goals}⚽` : ''}</Text>
                    </View>
                    {!!r.motm && <Ionicons name="star" size={16} color={colors.gold} />}
                    <Text variant="statSmall" tone={r.rating_eligible ? 'primary' : 'faint'}>{r.rating_eligible ? rating(r.rating_avg) : '–'}</Text>
                  </Row>
                ))}
              </Card>
            </>
          )}

          {d.teammates?.length > 0 && (
            <>
              <SectionTitle title="Most frequent teammates" />
              <Card padded={false}>
                {d.teammates.map((t: any, i: number) => (
                  <Row key={t.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Avatar uri={t.avatar_url} name={t.display_name} size={32} />
                    <Text variant="bodyStrong" style={{ flex: 1 }} onPress={() => router.push(`/player/${t.user_id}`)}>{t.display_name}</Text>
                    <Text variant="caption" tone="muted">{t.games} games · {Math.round((100 * t.wins) / Math.max(1, t.games))}% won</Text>
                  </Row>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {!!d.can_view_stats && (
        <>
          <SectionTitle title={`Achievements · ${unlocked.size}/${ACHIEVEMENTS.length}`} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(catalogue.data ?? ACHIEVEMENTS).map((a: any) => {
              const on = unlocked.has(a.code);
              const when = d.achievements?.find((x: any) => x.code === a.code)?.unlocked_at;
              return (
                <Card key={a.code} style={{ width: '48%', flexGrow: 1, opacity: on ? 1 : 0.45 }} accessibilityLabel={`${a.name}${on ? ', unlocked' : ', locked'}`}
                  onPress={on ? () => shareText(`${p.display_name} unlocked “${a.name}” on MATCHDAY 🏆`).catch(() => undefined) : undefined}>
                  <Row gap={space.sm}>
                    <Ionicons name={(on ? a.icon : 'lock-closed') as any} size={22} color={on ? colors.gold : colors.textFaint} />
                    <View style={{ flex: 1 }}>
                      <Text variant="smallStrong">{a.name}</Text>
                      <Text variant="caption" tone="muted" numberOfLines={2}>{!!on && when ? formatDate(when) : a.description}</Text>
                    </View>
                  </Row>
                </Card>
              );
            })}
          </View>
        </>
      )}

      {!d.is_self && (
        <Row gap={space.sm} wrap style={{ marginTop: space.lg }}>
          {!!d.is_friend && <Button title="Remove friend" size="sm" variant="ghost" onPress={() => run('remove', () => rpc('remove_friend', { p_user: userId }), 'Friend removed')} />}
          <Button title="Block" size="sm" variant="ghost" onPress={() => run('block', async () => { await rpc('block_user', { p_user: userId }); qc.invalidateQueries(); router.back(); }, 'User blocked')} />
          <Button title="Report" size="sm" variant="ghost" onPress={() => setReportOpen(true)} />
        </Row>
      )}

      <Sheet visible={reportOpen} onClose={() => setReportOpen(false)} title={`Report ${p.display_name}`}>
        <Text variant="small" tone="muted">Reports are reviewed by group moderators. Tell us what happened.</Text>
        <Input value={reason} onChangeText={setReason} multiline placeholder="Reason" maxLength={500} />
        <Button title="Send report" disabled={reason.trim().length < 3} loading={busy === 'report'} onPress={async () => {
          const ok = await run('report', () => rpc('report_content', { p_type: 'user', p_target: userId, p_reason: reason, p_group: groupId ?? d.groups[0]?.id ?? null }), 'Report sent. Thank you.');
          if (ok !== undefined) { setReportOpen(false); setReason(''); }
        }} />
      </Sheet>
      {Platform.OS === 'web' && <View style={{ height: space.xl }} />}
    </View>
  );
}
