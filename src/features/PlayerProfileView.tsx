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
import { shareViewAsImage } from '@/lib/share';
import { SEASON_CHAMPION, TRACKS, levelInfo, medalPoints, parseCode } from '@/domain/achievements';
import { AchievementBadge } from '@/components/football/AchievementBadge';
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
  const bests = useQuery({ queryKey: ['player', userId, 'bests'], queryFn: () => rpc<PersonalBests | null>('get_personal_bests', { p_user: userId }) });
  // card style lives on the profile row (readable by everyone who can see the profile)
  const style = useQuery({ queryKey: ['player', userId, 'card_style'], queryFn: () => q<{ card_style: string } | null>(supabase.from('profiles').select('card_style').eq('id', userId).maybeSingle()) });

  if (profile.isLoading) return <View style={{ gap: space.md }}><Skeleton height={220} /><Skeleton height={100} /><Skeleton height={100} /></View>;
  if (!profile.data) return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  const d = profile.data;
  const p = d.profile;
  const s = d.stats;
  const unlocked = new Set<string>((d.achievements ?? []).map((a: any) => a.code));
  const points = medalPoints(unlocked);
  const best: Record<string, number> = {};
  unlocked.forEach((c) => { const { track, level } = parseCode(c); best[track] = Math.max(best[track] ?? 0, level); });

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
      <PlayerCard ref={cardRef} data={{ ...p, stats: s ? { ...s, rating: s.rating } : null, achievements: points, card_style: style.data?.card_style }} />

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
            {!!d.can_view_stats && <Button title="Compare" icon="git-compare-outline" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/compare', params: groupId ? { b: userId, groupId } : { b: userId } })} />}
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
          <SectionTitle title={`Medals · ${points} pts`} action={d.is_self ? 'See all' : undefined} onAction={d.is_self ? () => router.push('/achievements') : undefined} />
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
              {TRACKS.map((t) => {
                const lvl = best[t.track] ?? 0;
                return (
                  <View key={t.track} style={{ width: '25%', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${t.name}: ${lvl ? levelInfo(lvl).label : 'not started'}`}>
                    <AchievementBadge icon={t.icon} level={lvl} size={44} animate={false} />
                    <Text variant="caption" align="center" numberOfLines={1} tone={lvl ? 'default' : 'faint'}>{t.name}</Text>
                    <Text variant="caption" align="center" style={{ color: lvl ? levelInfo(lvl).colour : colors.textFaint, marginTop: -4 }}>{lvl ? levelInfo(lvl).label : '–'}</Text>
                  </View>
                );
              })}
            </View>
            {unlocked.has(SEASON_CHAMPION.code) && (
              <Row gap={space.sm} style={{ marginTop: space.md, justifyContent: 'center' }}>
                <Ionicons name="ribbon" size={16} color={colors.gold} />
                <Text variant="smallStrong" tone="gold">Season Champion</Text>
              </Row>
            )}
          </Card>
        </>
      )}

      {!!d.can_view_stats && !!bests.data && <PersonalBestsCard b={bests.data} linkable={!!d.is_self} />}

      {!d.is_self && (
        <Row gap={space.sm} wrap style={{ marginTop: space.lg }}>
          {!!d.is_friend && <Button title="Remove friend" size="sm" variant="ghost" onPress={() => run('remove', () => rpc('remove_friend', { p_user: userId }), 'Friend removed')} />}
          <Button title="Block" size="sm" variant="ghost" onPress={() => run('block', async () => { await rpc('block_user', { p_user: userId }); qc.invalidateQueries(); router.back(); }, 'User blocked')} />
          <Button title="Report" size="sm" variant="ghost" onPress={() => setReportOpen(true)} />
        </Row>
      )}

      <Sheet visible={reportOpen} onClose={() => setReportOpen(false)} title={`Report ${p.display_name}`}>
        <Text variant="small" tone="muted">Reports are reviewed by group moderators. Tell us what happened.</Text>
        <Input value={reason} onChangeText={setReason} multiline placeholder="Tell us what happened" maxLength={500} />
        <Button title="Send report" disabled={reason.trim().length < 3} loading={busy === 'report'} onPress={async () => {
          const ok = await run('report', () => rpc('report_content', { p_type: 'user', p_target: userId, p_reason: reason, p_group: groupId ?? d.groups[0]?.id ?? null }), 'Report sent. Thank you.');
          if (ok !== undefined) { setReportOpen(false); setReason(''); }
        }} />
      </Sheet>
      {Platform.OS === 'web' && <View style={{ height: space.xl }} />}
    </View>
  );
}

interface Best { value: number | string; session_id: string; name: string; played_at: string }
interface PersonalBests { best_rating: Best | null; most_goals: Best | null; most_assists: Best | null; best_win_streak: number; best_unbeaten: number; best_weeks: number }

/** Records worth remembering. Rows only appear once there's something to show. */
function PersonalBestsCard({ b, linkable }: { b: PersonalBests; linkable: boolean }) {
  const { colors } = useTheme();
  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; best?: Best | null }[] = [];
  if (b.best_rating) rows.push({ icon: 'trending-up', label: 'Best rating', value: Number(b.best_rating.value).toFixed(1), best: b.best_rating });
  if (b.most_goals) rows.push({ icon: 'football', label: 'Most goals in a game', value: String(b.most_goals.value), best: b.most_goals });
  if (b.most_assists) rows.push({ icon: 'git-merge', label: 'Most assists in a game', value: String(b.most_assists.value), best: b.most_assists });
  if (b.best_win_streak > 1) rows.push({ icon: 'flash', label: 'Longest winning run', value: `${b.best_win_streak} games` });
  if (b.best_unbeaten > 1) rows.push({ icon: 'shield-checkmark', label: 'Longest unbeaten run', value: `${b.best_unbeaten} games` });
  if (b.best_weeks > 1) rows.push({ icon: 'flame', label: 'Most weeks in a row', value: `${b.best_weeks} weeks` });
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle title="Personal bests" />
      <Card padded={false}>
        {rows.map((r, i) => (
          <Row key={r.label} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <Ionicons name={r.icon} size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="smallStrong">{r.label}</Text>
              {!!r.best && (
                <Text variant="caption" tone="muted" numberOfLines={1} onPress={linkable ? () => router.push(`/session/${r.best!.session_id}`) : undefined}>
                  {r.best.name} · {formatDate(r.best.played_at)}
                </Text>
              )}
            </View>
            <Text variant="statSmall">{r.value}</Text>
          </Row>
        ))}
      </Card>
    </>
  );
}
