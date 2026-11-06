import React, { useRef, useState } from 'react';
import { Platform, Pressable, View, type HostInstance } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, Row, SectionTitle, Sheet, Skeleton, StatGrid, StatTile, SwipeSelect, Text, useToast } from '@/components/ui';
import { PlayerCard } from '@/components/football/PlayerCard';
import { FormPills, RatingChart } from '@/components/football/FormChart';
import { usePlayerProfile, keys } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc, q } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { shareViewAsImage } from '@/lib/share';
import { SEASON_CHAMPION, TRACKS, levelInfo, medalPoints, parseCode } from '@/domain/achievements';
import { AchievementBadge } from '@/components/football/AchievementBadge';
import { formatDate, formatKickoff, POSITION_LABEL, rating, plural } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { ReliabilityChip, useReliability } from '@/features/Reliability';
import { HandshakeModal, type Friend } from '@/features/moments/Handshake';

export function PlayerProfileView({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState<string | null>(null);
  const profile = usePlayerProfile(userId, groupId);
  const { run, busy } = useAction([keys.player(userId, groupId), keys.friends]);
  const cardRef = useRef<HostInstance>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [newFriend, setNewFriend] = useState<Friend | null>(null);
  const [reason, setReason] = useState('');
  const reliability = useReliability([userId]);
  const links = useQuery({ queryKey: ['player', userId, 'connections'], queryFn: () => rpc<Connections | null>('get_player_connections', { p_user: userId }) });
  const bests = useQuery({ queryKey: ['player', userId, 'bests'], queryFn: () => rpc<PersonalBests | null>('get_personal_bests', { p_user: userId }) });
  // card style, flag and club live on the profile row (readable by everyone signed in)
  const style = useQuery({ queryKey: ['player', userId, 'card'], queryFn: () => q<{ card_style: string; nationality: string | null; supported_club: string | null; card_medals: string[]; card_title: string | null } | null>(supabase.from('profiles').select('card_style, nationality, supported_club, card_medals, card_title').eq('id', userId).maybeSingle()) });

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
      const r = await shareViewAsImage(cardRef, `matchday-${p.username}`, `${p.display_name} on MATCHDAY — rating ${rating(s?.rating)}, ${plural(s?.goals ?? 0, 'goal')}, ${s?.motm ?? 0} MOTM`);
      if (r === 'downloaded') toast.success('Player card downloaded');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <HandshakeModal them={newFriend} onClose={() => setNewFriend(null)} />
      <PlayerCard ref={cardRef} data={{ ...p, stats: s ? { ...s, rating: s.rating } : null, achievements: points, card_style: style.data?.card_style, nationality: style.data?.nationality, supported_club: style.data?.supported_club, medals: style.data?.card_medals, title: style.data?.card_title, reliability: reliability.data?.[userId] ?? null }} />

      <Row gap={space.sm} wrap>
        {d.is_self ? (
          <>
            <Button title="Edit profile" icon="create-outline" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/settings/profile')} />
            <IconButton icon="share-social-outline" label="Share card" onPress={share} />
            <IconButton icon="sparkles-outline" label="Wrapped" onPress={() => router.push('/wrapped')} />
          </>
        ) : (
          <>
            {d.is_friend ? (
              <Badge label="Friends" tone="success" />
            ) : d.friend_request?.outgoing ? (
              <Button title="Request sent" size="sm" variant="secondary" disabled />
            ) : d.friend_request ? (
              <Button title="Accept request" icon="checkmark" size="sm" loading={busy === 'accept'} onPress={async () => {
                const ok = await run('accept', () => rpc('respond_friend_request', { p_request: d.friend_request.id, p_accept: true }));
                if (ok !== undefined) setNewFriend({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
              }} />
            ) : (
              <Button title="Add friend" icon="person-add-outline" size="sm" loading={busy === 'add'} onPress={async () => {
                const r = await run('add', () => rpc<string>('send_friend_request', { p_target: userId }), (x) => (x === 'accepted' ? '' : 'Friend request sent'));
                if (r === 'accepted') setNewFriend({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
              }} />
            )}
            {!!d.can_view_stats && <Button title="Compare" icon="git-compare-outline" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/compare', params: groupId ? { b: userId, groupId } : { b: userId } })} />}
            <IconButton icon="share-social-outline" label="Share card" onPress={share} />
          </>
        )}
      </Row>

      {!!p.bio && <Text tone="muted">{p.bio}</Text>}
      <Text variant="caption" tone="faint">{POSITION_LABEL[p.position]} · Joined {formatDate(p.created_at)} · {plural(d.friends_count, 'friend')}</Text>
      {/* 90%+ is already on the card; below that it shows here so hosts can see it */}
      {(reliability.data?.[userId]?.pct ?? 100) < 90 && <ReliabilityChip r={reliability.data?.[userId]} />}

      {d.groups.length > 0 && d.can_view_stats && (
        <SwipeSelect label="Stats" value={groupId} onChange={setGroupId}
          options={[{ value: null as string | null, label: 'Career', icon: 'person-outline' as const }, ...d.groups.map((g: any) => ({ value: g.id as string | null, label: g.name, icon: 'people-outline' as const }))]} />
      )}

      {!d.can_view_stats ? (
        <Card><EmptyState icon="lock-closed-outline" title="Stats are private" message={`${p.display_name} only shares statistics with friends.`} /></Card>
      ) : !s || s.sessions === 0 ? (
        <Card><EmptyState icon="football-outline" title="No verified games yet" message="Statistics appear once a session is finalised." /></Card>
      ) : (
        <>
          <SectionTitle title={groupId ? 'Group record' : 'Career'} />
          {/* the card above shows games, wins, goals, assists and MOTM; these add the detail */}
          <StatGrid>
            <StatTile label="Record" value={`${s.wins}W`} sub={`${s.draws}D · ${s.losses}L`} />
            <StatTile label="G/A a game" value={((s.goals + s.assists) / Math.max(1, s.sessions)).toFixed(1)} sub={`${(s.goals / Math.max(1, s.sessions)).toFixed(1)} G · ${(s.assists / Math.max(1, s.sessions)).toFixed(1)} A`} />
            <StatTile label="Win streak" value={s.current_win_streak} sub={`Best ${s.best_win_streak}`} />
            <StatTile label="Unbeaten" value={s.current_unbeaten} sub={`Best ${s.best_unbeaten}`} />
          </StatGrid>

          <SectionTitle title="Form" />
          <Card>
            <View style={{ gap: space.md }}>
              <FormPills ratings={[...(d.form ?? []).map((f: any) => Number(f.rating)), ...Array(Math.max(0, 5 - (d.form?.length ?? 0))).fill(null)]} />
              <RatingChart points={(d.rating_history ?? []).map((r: any) => ({ rating: Number(r.rating), played_at: r.played_at }))} />
            </View>
          </Card>

          {d.recent_results?.length > 0 && (
            <>
              <SectionTitle title="Recent sessions" />
              <Card padded={false}>
                {d.recent_results.slice(0, 3).map((r: any, i: number) => (
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

      {!!d.can_view_stats && !!links.data && (!!links.data.partner || !!links.data.nemesis) && <ConnectionsCard c={links.data} self={!!d.is_self} name={p.display_name} userId={userId} />}

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

interface Linked { player: { id: string; username: string; display_name: string; avatar_url: string | null }; games: number; wins: number; losses?: number; win_pct?: number }
interface Connections { partner: Linked | null; nemesis: Linked | null }

/** Who this player wins most with, and who keeps beating them. */
function ConnectionsCard({ c, self, name, userId }: { c: Connections; self: boolean; name: string; userId: string }) {
  const { colors } = useTheme();
  const first = name.split(' ')[0];
  const rows = [
    c.partner && {
      key: 'partner', icon: 'people' as const, colour: colors.primary, title: 'Best partner', who: c.partner.player,
      line: `${self ? 'You win' : `${first} wins`} ${c.partner.win_pct}% of games together (${c.partner.games} played)`,
      onPress: () => router.push(`/player/${c.partner!.player.id}`),
    },
    c.nemesis && {
      key: 'nemesis', icon: 'flame' as const, colour: colors.danger, title: 'Nemesis', who: c.nemesis.player,
      line: `${self ? 'Beat you' : `Beat ${first}`} ${plural(c.nemesis.losses ?? 0, 'time')} in ${plural(c.nemesis.games, 'game')}`,
      onPress: () => router.push({ pathname: '/compare', params: { a: userId, b: c.nemesis!.player.id } }),
    },
  ].filter(Boolean) as { key: string; icon: 'people' | 'flame'; colour: string; title: string; who: Linked['player']; line: string; onPress: () => void }[];
  return (
    <>
      <SectionTitle title="Partners & rivals" />
      <Card padded={false}>
        {rows.map((r, i) => (
          <Pressable key={r.key} onPress={r.onPress} accessibilityRole="button" accessibilityLabel={`${r.title}: ${r.who.display_name}. ${r.line}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Row gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View>
                <Avatar uri={r.who.avatar_url} name={r.who.display_name} size={44} />
                <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={r.icon} size={13} color={r.colour} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" style={{ color: r.colour }}>{r.title}</Text>
                <Text variant="bodyStrong" numberOfLines={1}>{r.who.display_name}</Text>
                <Text variant="caption" tone="muted">{r.line}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Row>
          </Pressable>
        ))}
      </Card>
    </>
  );
}
