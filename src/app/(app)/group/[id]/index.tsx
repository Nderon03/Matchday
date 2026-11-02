import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, Header, IconButton, Input, Loading, Row, Screen, SectionTitle, Segmented, Sheet, StatTile, Text,
} from '@/components/ui';
import { SessionCard } from '@/components/football/SessionCard';
import { Leaderboard } from '@/components/football/Leaderboard';
import { FeedItemCard } from '@/components/football/FeedItem';
import { InviteQr } from '@/components/football/InviteQr';
import { keys, useFeed, useFriends, useGroup, useGroupSessions } from '@/hooks/queries';
import { PeoplePicker } from '@/components/football/PeoplePicker';
import { toggleIn } from '@/domain/sets';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/domain/format';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Tab = 'overview' | 'members' | 'fixtures' | 'results' | 'tables' | 'awards' | 'seasons' | 'feed' | 'records';
const AWARD_LABEL: Record<string, string> = {
  player_of_season: 'Player of the Season', golden_boot: 'Golden Boot', most_motm: 'Most MOTM Awards', highest_rating: 'Highest Average Rating',
  most_appearances: 'Most Appearances', most_wins: 'Most Wins', best_win_pct: 'Best Win Percentage', most_improved: 'Most Improved Player', most_assists: 'Playmaker (Most Assists)',
};

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const group = useGroup(id);
  const sessions = useGroupSessions(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const friends = useFriends();
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [season, setSeason] = useState({ name: '', starts: new Date().toISOString().slice(0, 10), ends: `${new Date().getFullYear()}-12-31` });
  const { run, busy } = useAction([keys.group(id), keys.groups]);
  const records = useQuery({ queryKey: ['group', id, 'records'], enabled: tab === 'records' || tab === 'overview', queryFn: () => rpc<any>('get_group_records', { p_group: id }) });
  const awards = useQuery({
    queryKey: ['group', id, 'awards'],
    enabled: tab === 'awards',
    queryFn: async () => {
      const { data, error } = await supabase.from('season_awards').select('*, season:seasons!inner(id, name, group_id), profile:profiles(id, username, display_name, avatar_url)').eq('season.group_id', id);
      if (error) throw error;
      return data as any[];
    },
  });
  const feed = useFeed(tab === 'feed' ? id : undefined);

  if (group.isLoading) return <Screen><Header title="Group" /><Loading /></Screen>;
  if (!group.data) return <Screen><Header title="Group" /><ErrorState error={group.error} onRetry={group.refetch} /></Screen>;
  const { group: g, members, seasons, myRole, joinRequests, settings } = group.data;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const canAdd = !!myRole && (isAdmin || g.join_policy !== 'invite_only');
  const memberIds = new Set(members.map((m) => m.user_id));
  const addableFriends = (friends.data?.friends ?? []).filter((f) => !memberIds.has(f.id));
  const upcoming = (sessions.data ?? []).filter((s) => ['scheduled', 'in_progress'].includes(s.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const results = (sessions.data ?? []).filter((s) => ['completed', 'finalised'].includes(s.status));

  return (
    <Screen edges={['top', 'bottom']} onRefresh={() => { group.refetch(); sessions.refetch(); }} refreshing={group.isRefetching}>
      <Header title={g.name} subtitle={`${members.length} members${g.location ? ` · ${g.location}` : ''}`}
        right={<Row>
          {!!myRole && <IconButton icon="person-add-outline" label="Add players" onPress={() => setInviteOpen(true)} />}
          {!!isAdmin && <IconButton icon="settings-outline" label="Group settings" onPress={() => router.push(`/group/${id}/settings`)} />}
        </Row>} />

      {!!g.cover_url && <Image source={{ uri: g.cover_url }} style={{ height: 140, borderRadius: radius.lg }} contentFit="cover" />}

      {!myRole && (
        <Card variant="highlight">
          <Row gap={space.md}>
            <Text style={{ flex: 1 }}>You’re viewing a public group.</Text>
            {g.join_policy !== 'invite_only' && (
              <Button title={g.join_policy === 'open' ? 'Join group' : 'Request to join'} size="sm" loading={busy === 'join'}
                onPress={() => run('join', () => rpc<string>('join_group', { p_group: id }), (r) => (r === 'joined' ? 'Welcome!' : 'Request sent'))} />
            )}
          </Row>
        </Card>
      )}

      <Segmented scroll value={tab} onChange={setTab} options={[
        { value: 'overview', label: 'Overview' }, { value: 'fixtures', label: 'Fixtures' }, { value: 'results', label: 'Results' },
        { value: 'tables', label: 'Tables' }, { value: 'members', label: 'Members' }, { value: 'awards', label: 'Awards' },
        { value: 'seasons', label: 'Seasons' }, { value: 'feed', label: 'Feed' }, { value: 'records', label: 'Records' },
      ]} />

      {tab === 'overview' && (
        <View style={{ gap: space.lg }}>
          {!!g.description && <Text tone="muted">{g.description}</Text>}
          <Row gap={space.sm}>
            <StatTile compact label="Sessions" value={records.data?.sessions_played ?? '–'} />
            <StatTile compact label="Goals" value={records.data?.goals_scored ?? '–'} />
            <StatTile compact label="Members" value={members.length} />
          </Row>
          {!!myRole && <Button title="Create a session for this group" icon="add" onPress={() => router.push({ pathname: '/session/new', params: { groupId: id } })} />}
          {!!isAdmin && joinRequests.length > 0 && (
            <View style={{ gap: space.sm }}>
              <SectionTitle title={`Join requests · ${joinRequests.length}`} />
              {joinRequests.map((r) => (
                <Card key={r.id}>
                  <Row gap={space.md}>
                    <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{r.profile.display_name}</Text>
                      {!!r.message && <Text variant="caption" tone="muted">“{r.message}”</Text>}
                    </View>
                    <Button title="Accept" size="sm" loading={busy === `acc-${r.id}`} onPress={() => run(`acc-${r.id}`, () => rpc('decide_join_request', { p_request: r.id, p_approve: true }), 'Member added')} />
                    <Button title="Decline" size="sm" variant="ghost" onPress={() => run(`dec-${r.id}`, () => rpc('decide_join_request', { p_request: r.id, p_approve: false }))} />
                  </Row>
                </Card>
              ))}
            </View>
          )}
          <SectionTitle title="Next fixture" />
          {upcoming[0] ? <SessionCard session={upcoming[0]} /> : <Text tone="muted" variant="small">Nothing scheduled.</Text>}
          {!!results[0] && (<><SectionTitle title="Latest result" /><SessionCard session={results[0]} /></>)}
          {!!g.rules && (<><SectionTitle title="Rules" /><Card><Text variant="small">{g.rules}</Text></Card></>)}
        </View>
      )}

      {tab === 'fixtures' && (
        <View style={{ gap: space.md }}>
          {upcoming.length === 0 && <EmptyState icon="calendar-outline" title="No upcoming fixtures" action={myRole ? { label: 'Create a session', onPress: () => router.push({ pathname: '/session/new', params: { groupId: id } }) } : undefined} />}
          {upcoming.map((s) => <SessionCard key={s.id} session={s} />)}
        </View>
      )}

      {tab === 'results' && (
        <View style={{ gap: space.md }}>
          {results.length === 0 && <EmptyState icon="football-outline" title="No results yet" />}
          {results.map((s) => (
            <Card key={s.id} onPress={() => router.push(`/session/${s.id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{s.name}</Text>
                  <Text variant="caption" tone="muted">{formatDate(s.starts_at)} · {s.format_size}-a-side{s.status === 'completed' ? ' · voting open' : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {[...(s.fixtures ?? [])].sort((a: any, b: any) => a.number - b.number).filter((f: any) => f.played).map((f: any) => {
                    const a = f.teams.find((t: any) => t.side === 'A')?.score;
                    const b = f.teams.find((t: any) => t.side === 'B')?.score;
                    return <Text key={f.id} variant="smallStrong">{s.fixtures.length > 1 ? `G${f.number}  ` : ''}{a}–{b}</Text>;
                  })}
                </View>
              </Row>
            </Card>
          ))}
        </View>
      )}

      {tab === 'tables' && <Leaderboard scope="group" groupId={id} seasons={seasons} minAppearances={settings?.leaderboard_min_appearances} />}

      {tab === 'members' && (
        <View style={{ gap: space.md }}>
        {members.length >= 2 && (
          <Button title="Compare two players" icon="git-compare-outline" variant="secondary" onPress={() => router.push({ pathname: '/compare', params: { groupId: id } })} />
        )}
        <Card padded={false}>
          {members.map((m, i) => (
            <Row key={m.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Avatar uri={m.profile.avatar_url} name={m.profile.display_name} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" onPress={() => router.push(`/player/${m.user_id}`)}>{m.profile.display_name}</Text>
                <Text variant="caption" tone="muted">@{m.profile.username} · joined {formatDate(m.joined_at)}</Text>
              </View>
              {m.role !== 'member' && <Badge label={m.role} tone={m.role === 'owner' ? 'primary' : 'neutral'} />}
            </Row>
          ))}
        </Card>
        </View>
      )}

      {tab === 'awards' && (
        <View style={{ gap: space.md }}>
          {!!awards.isLoading && <Loading />}
          {awards.data?.length === 0 && <EmptyState icon="trophy-outline" title="No awards yet" message="Awards are calculated when an admin finalises a season." />}
          {seasons.filter((s) => s.status === 'completed').map((s) => {
            const list = (awards.data ?? []).filter((a) => a.season_id === s.id);
            if (!list.length) return null;
            return (
              <View key={s.id} style={{ gap: space.sm }}>
                <SectionTitle title={s.name} />
                {list.map((a) => (
                  <Card key={a.id} onPress={() => shareText(`${a.profile.display_name} won ${AWARD_LABEL[a.award] ?? a.award} in ${s.name} at ${g.name} 🏆 #MATCHDAY`).catch(() => undefined)}>
                    <Row gap={space.md}>
                      <Ionicons name={a.award === 'player_of_season' ? 'trophy' : a.award === 'golden_boot' ? 'football' : 'ribbon'} size={22} color={colors.gold} />
                      <View style={{ flex: 1 }}>
                        <Text variant="smallStrong">{AWARD_LABEL[a.award] ?? a.award}</Text>
                        <Text variant="caption" tone="muted">{a.profile.display_name} · {Number(a.value)} ({a.appearances} apps)</Text>
                      </View>
                      <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={32} />
                    </Row>
                  </Card>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {tab === 'seasons' && (
        <View style={{ gap: space.md }}>
          {!!isAdmin && <Button title="Start a new season" icon="add" variant="secondary" onPress={() => setSeasonOpen(true)} />}
          {seasons.length === 0 && <EmptyState icon="calendar-number-outline" title="No seasons yet" message="Seasons add separate tables and awards. Career history is never reset." />}
          {seasons.map((s) => (
            <Card key={s.id}>
              <Row gap={space.md}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{s.name}</Text>
                  <Text variant="caption" tone="muted">{formatDate(s.starts_on)} – {formatDate(s.ends_on)}</Text>
                </View>
                <Badge label={s.status === 'active' ? 'Active' : 'Completed'} tone={s.status === 'active' ? 'success' : 'neutral'} />
                {!!isAdmin && s.status === 'active' && (
                  <Button title="Finalise" size="sm" variant="ghost" loading={busy === `fs-${s.id}`} onPress={() => run(`fs-${s.id}`, () => rpc('finalise_season', { p_season: s.id }), 'Season finalised — awards calculated')} />
                )}
              </Row>
            </Card>
          ))}
        </View>
      )}

      {tab === 'feed' && (
        <View style={{ gap: space.md }}>
          {feed.data?.pages.flat().map((item) => <FeedItemCard key={item.id} item={item} />)}
          {!!feed.data && feed.data.pages[0].length === 0 && <EmptyState icon="newspaper-outline" title="Quiet so far" message="Results, MOTMs and achievements will show up here." />}
          {!!feed.hasNextPage && <Button title="Load more" variant="secondary" onPress={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage} />}
        </View>
      )}

      {tab === 'records' && (
        <View style={{ gap: space.sm }}>
          {!!records.isLoading && <Loading />}
          {!!records.error && <ErrorState error={records.error} onRetry={records.refetch} compact />}
          {!!records.data && ([
            ['Highest-scoring game', records.data.highest_scoring_fixture, (r: any) => `${r.score} · ${r.name}, ${formatDate(r.date)}`],
            ['Biggest victory', records.data.biggest_victory, (r: any) => `${r.score} · ${r.name}, ${formatDate(r.date)}`],
            ['Most goals in a session', records.data.most_goals_in_session, (r: any) => `${r.user.display_name} · ${r.value} goals`],
            ['Highest session rating', records.data.highest_session_rating, (r: any) => `${r.user.display_name} · ${Number(r.value).toFixed(1)}`],
            ['Most consecutive wins', records.data.most_consecutive_wins, (r: any) => `${r.user.display_name} · ${r.value} games`],
            ['Longest unbeaten run', records.data.longest_unbeaten, (r: any) => `${r.user.display_name} · ${r.value} games`],
            ['Most MOTM in a season', records.data.most_motm_in_season, (r: any) => `${r.user.display_name} · ${r.value} (${r.season})`],
            ['All-time top scorer', records.data.top_scorer, (r: any) => `${r.user.display_name} · ${r.value} goals`],
            ['Most appearances', records.data.most_appearances, (r: any) => `${r.user.display_name} · ${r.value}`],
          ] as [string, any, (r: any) => string][]).map(([label, rec, fmt]) => (
            <Card key={label}>
              <Row gap={space.md}>
                <Ionicons name="ribbon-outline" size={20} color={rec ? colors.gold : colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Text variant="smallStrong">{label}</Text>
                  <Text variant="small" tone="muted">{rec ? fmt(rec) : 'Not set yet'}</Text>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      )}

      <Sheet visible={inviteOpen} onClose={() => { setInviteOpen(false); setPicked(new Set()); }} title={`Add players to ${g.name}`}>
        <ScrollView contentContainerStyle={{ gap: space.md }}>
          {canAdd ? (
            <>
              <Text variant="smallStrong" tone="muted">Your friends</Text>
              <PeoplePicker
                people={addableFriends}
                selected={picked}
                onToggle={(uid) => setPicked((p) => toggleIn(p, uid))}
                emptyText={friends.data?.friends.length ? 'All your friends are already in this group.' : 'No friends yet — add some from the Friends screen, or share the link below.'}
              />
              <Button title={picked.size ? `Add ${picked.size} to group` : 'Add to group'} icon="person-add" disabled={!picked.size} loading={busy === 'add-members'}
                onPress={async () => {
                  const n = await run('add-members', () => rpc<number>('add_group_members', { p_group: id, p_users: [...picked] }), (count) => `${count} player${count === 1 ? '' : 's'} added`);
                  if (n !== undefined) { setPicked(new Set()); setInviteOpen(false); }
                }} />
            </>
          ) : (
            <Text variant="small" tone="muted">Only admins can add people to this invite-only group.</Text>
          )}
          <Text variant="smallStrong" tone="muted">Not friends yet or not on MATCHDAY?</Text>
          <Text variant="caption" tone="faint">Share this link or let them scan the QR code. It expires in 7 days.</Text>
          <InviteQr kind="group" targetId={id} message={`Join ${g.name} on MATCHDAY`} />
        </ScrollView>
      </Sheet>
      <Sheet visible={seasonOpen} onClose={() => setSeasonOpen(false)} title="New season">
        <Input label="Name" value={season.name} onChangeText={(v) => setSeason((s) => ({ ...s, name: v }))} placeholder={`Season ${seasons.length + 1} — ${new Date().getFullYear()}`} />
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label="Starts (YYYY-MM-DD)" value={season.starts} onChangeText={(v) => setSeason((s) => ({ ...s, starts: v }))} /></View>
          <View style={{ flex: 1 }}><Input label="Ends (YYYY-MM-DD)" value={season.ends} onChangeText={(v) => setSeason((s) => ({ ...s, ends: v }))} /></View>
        </Row>
        <Button title="Create season" loading={busy === 'season'} onPress={async () => {
          const ok = await run('season', () => rpc('create_season', { p_group: id, p_name: season.name || `Season ${seasons.length + 1}`, p_starts: season.starts, p_ends: season.ends }), 'Season started');
          if (ok !== undefined) setSeasonOpen(false);
        }} />
      </Sheet>
    </Screen>
  );
}
