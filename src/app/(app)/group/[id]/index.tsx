import React, { useRef, useState } from 'react';
import { ScrollView, View, Pressable, type HostInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, Header, IconButton, Input, Loading, Row, Screen, SectionTitle, Segmented, Sheet, StatTile, Text, useConfirm,
} from '@/components/ui';
import { SessionCard } from '@/components/football/SessionCard';
import { Leaderboard } from '@/components/football/Leaderboard';
import { FeedItemCard } from '@/components/football/FeedItem';
import { InviteQr } from '@/components/football/InviteQr';
import { keys, useFeed, useFriends, useGroup, useGroupSessions } from '@/hooks/queries';
import { PeoplePicker } from '@/components/football/PeoplePicker';
import { toggleIn } from '@/domain/sets';
import { useAction } from '@/hooks/useAction';
import { q, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatDate, formatPence, plural } from '@/domain/format';
import { shareText } from '@/lib/share';
import { removeGroupMember } from '@/features/removePlayer';
import { FinesPanel } from '@/features/FinesPanel';
import { useOnce } from '@/features/moments/useOnce';
import { Coachmarks, type CoachStep } from '@/features/Coachmarks';
import { useGroupBalances } from '@/features/SettleUp';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { TeamOfMonth } from '@/features/TeamOfMonth';
import { ReliabilityChip, useReliability } from '@/features/Reliability';
import { GroupWelcome } from '@/features/GroupWelcome';
import { HelpButton } from '@/features/ScreenHelp';

type Tab = 'overview' | 'games' | 'tables' | 'history' | 'members';
const AWARD_LABEL: Record<string, string> = {
  player_of_season: 'Player of the Season', golden_boot: 'Golden Boot', most_motm: 'Most MOTM Awards', highest_rating: 'Highest Average Rating',
  most_appearances: 'Most Appearances', most_wins: 'Most Wins', best_win_pct: 'Best Win Percentage', most_improved: 'Most Improved Player', most_assists: 'Playmaker (Most Assists)',
};

export default function GroupScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const { colors } = useTheme();
  const group = useGroup(id);
  const reqReliability = useReliability(group.data?.joinRequests.map((r) => r.user_id) ?? []);
  const { userId } = useAuth();
  const confirm = useConfirm();
  const balances = useGroupBalances(id, group.data?.myRole === 'owner' || group.data?.myRole === 'admin');
  const sessions = useGroupSessions(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [inviteOpen, setInviteOpen] = useState(false);
  // the quick tour: shown once after creating your first group, and again from the ? button
  const inviteRef = useRef<HostInstance>(null);
  const settingsRef = useRef<HostInstance>(null);
  const createRef = useRef<HostInstance>(null);
  const tabsRef = useRef<HostInstance>(null);
  const helpRef = useRef<HostInstance>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const friends = useFriends();
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [season, setSeason] = useState({ name: '', starts: new Date().toISOString().slice(0, 10), ends: `${new Date().getFullYear()}-12-31` });
  const { run, busy } = useAction([keys.group(id), keys.groups]);
  const records = useQuery({ queryKey: ['group', id, 'records'], enabled: tab === 'history' || tab === 'overview', queryFn: () => rpc<any>('get_group_records', { p_group: id }) });
  const awards = useQuery({
    queryKey: ['group', id, 'awards'],
    enabled: tab === 'history',
    queryFn: async () => {
      const { data, error } = await supabase.from('season_awards').select('*, season:seasons!inner(id, name, group_id), profile:profiles(id, username, display_name, avatar_url)').eq('season.group_id', id);
      if (error) throw error;
      return data as any[];
    },
  });
  const feed = useFeed(tab === 'overview' ? id : undefined);
  // invitations sent but not answered yet (members can see who's been invited)
  const invites = useQuery({
    queryKey: ['group', id, 'invites'],
    enabled: !!group.data?.myRole,
    queryFn: () => q<any[]>(supabase.from('group_invitations').select('user_id, invited_by, created_at, profile:profiles!group_invitations_user_id_fkey(id, username, display_name, avatar_url)').eq('group_id', id).eq('status', 'pending').order('created_at', { ascending: false })),
  });

  // paid groups without late fines: a one-time nudge for owners/admins that the option exists
  const gd = group.data;
  const finesHint = useOnce(`matchday.finesHint.${id}`,
    !!gd && (gd.myRole === 'owner' || gd.myRole === 'admin') && !gd.settings?.late_fines_enabled && (sessions.data ?? []).some((x) => x.payment_mode !== 'free'));

  const firstTour = useOnce('matchday.groupTour', isNew === '1' && gd?.myRole === 'owner');
  const tourSteps: CoachStep[] = [
    { target: inviteRef, emoji: '👋', title: 'Bring your squad', body: 'Invite players here: by link, QR code or from your friends. They get a request to join.' },
    { target: createRef, emoji: '⚽', title: 'Set up a game', body: 'Create the group’s games here. Everyone in the group gets the invite and can tap “I’m in”.' },
    { target: tabsRef, emoji: '📊', title: 'Everything in one place', body: 'Games, tables and history live in these tabs, with members at the end.' },
    { target: settingsRef, emoji: '⚙️', title: 'Make it yours', body: 'Change who can join, stats, payments and late fines any time.' },
    { target: helpRef, emoji: '❓', title: 'Need this again?', body: 'Tap here to replay this quick tour whenever you like.' },
  ];
  const endTour = (finished: boolean) => {
    setTourOpen(false);
    firstTour.markDone();
    // straight from creating the group to inviting people
    if (finished && isNew === '1') setInviteOpen(true);
  };

  if (group.isLoading) return <Screen><Header title="Group" /><Loading /></Screen>;
  if (!group.data) return <Screen><Header title="Group" /><ErrorState error={group.error} onRetry={group.refetch} /></Screen>;
  const { group: g, members, seasons, myRole, joinRequests, settings } = group.data;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const canAdd = !!myRole && (isAdmin || g.join_policy !== 'invite_only');
  // owners can remove anyone but themselves; admins can remove moderators and members
  const canRemove = (uid: string, role: string) => uid !== userId && role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && (role === 'member' || role === 'moderator')));
  const removeMember = (uid: string, name: string) => removeGroupMember({ confirm, run, groupId: id, userId: uid, name });
  const memberIds = new Set(members.map((m) => m.user_id));
  const invitedIds = new Set((invites.data ?? []).map((i) => i.user_id));
  const addableFriends = (friends.data?.friends ?? []).filter((f) => !memberIds.has(f.id) && !invitedIds.has(f.id));
  const leave = async () => {
    if (await confirm({ title: `Leave ${g.name}?`, message: 'You’ll stop seeing its games and chat. Games you’ve already said yes to stay as they are. Your stats are kept, and you can come back if someone invites you.', confirmLabel: 'Leave group', destructive: true })) {
      run('leave', async () => { await rpc('remove_group_member', { p_group: id, p_user: userId }); router.replace('/leagues'); }, `You left ${g.name}`);
    }
  };
  const upcoming = (sessions.data ?? []).filter((s) => ['scheduled', 'in_progress'].includes(s.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const results = (sessions.data ?? []).filter((s) => ['completed', 'finalised'].includes(s.status));

  return (
    <Screen edges={['top', 'bottom']} onRefresh={() => { group.refetch(); sessions.refetch(); }} refreshing={group.isRefetching}>
      <Header title={g.name} subtitle={`${plural(members.length, 'member')}${g.location ? ` · ${g.location}` : ''}`}
        right={<Row>
          {!!myRole && <View ref={helpRef} collapsable={false}><HelpButton label="How this page works" onPress={() => { setTab('overview'); setTourOpen(true); }} /></View>}
          {!!myRole && <View ref={inviteRef} collapsable={false}><IconButton size={36} icon="person-add-outline" label="Invite players" onPress={() => setInviteOpen(true)} /></View>}
          {!!isAdmin && <View ref={settingsRef} collapsable={false}><IconButton size={36} icon="settings-outline" label="Group settings" onPress={() => router.push(`/group/${id}/settings`)} /></View>}
        </Row>} />

      {!!g.cover_url && <Image source={{ uri: g.cover_url }} style={{ height: 140, borderRadius: radius.lg }} contentFit="cover" />}

      {!myRole && !!group.data.myRemoval && (
        <Card style={{ borderColor: colors.danger, backgroundColor: colors.dangerMuted }}>
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="person-remove" size={24} color={colors.danger} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h3" color={colors.danger}>You’ve been removed from this group</Text>
              {!!group.data.myRemoval.reason && <Text>Reason: {group.data.myRemoval.reason}</Text>}
              <Text variant="small" tone="muted">You can only rejoin if an admin adds you back.</Text>
            </View>
          </Row>
        </Card>
      )}
      {!myRole && !group.data.myRemoval && (
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

      <View ref={tabsRef} collapsable={false}>
      <Segmented scroll value={tab} onChange={setTab} options={[
        { value: 'overview', label: 'Overview' }, { value: 'games', label: 'Games' }, { value: 'tables', label: 'Tables' },
        { value: 'history', label: 'History' },
        // last, so it's easy to find (inviting, leaving, removing, fines)
        { value: 'members', label: `Members · ${members.length}` },
      ]} />
      </View>
      {!!userId && !!myRole && (
        <GroupWelcome userId={userId} group={g} members={members} nextGame={upcoming[0] ? { id: upcoming[0].id, name: upcoming[0].name, starts_at: upcoming[0].starts_at } : null} />
      )}

      {tab === 'overview' && (
        <View style={{ gap: space.lg }}>
          {!!g.description && <Text tone="muted">{g.description}</Text>}
          <Row gap={space.sm}>
            <StatTile compact label="Sessions" value={records.data?.sessions_played ?? '–'} />
            <StatTile compact label="Goals" value={records.data?.goals_scored ?? '–'} />
            <Pressable style={{ flex: 1 }} onPress={() => setTab('members')} accessibilityRole="button" accessibilityLabel={`${plural(members.length, 'member')}, see all`}>
              <StatTile compact label="Members ›" value={members.length} />
            </Pressable>
          </Row>
          {!!myRole && <View ref={createRef} collapsable={false}><Button title="Create a session for this group" icon="add" onPress={() => router.push({ pathname: '/session/new', params: { groupId: id } })} /></View>}
          {finesHint.due && (
            <Card variant="alt">
              <Row gap={space.sm}>
                <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                <Text variant="small" style={{ flex: 1 }} onPress={() => { finesHint.markDone(); router.push(`/group/${id}/settings`); }} accessibilityRole="button">
                  Players turning up late? <Text variant="small" tone="primary">Turn on late fines</Text> in group settings.
                </Text>
                <IconButton icon="close" size={28} label="Dismiss" onPress={finesHint.markDone} />
              </Row>
            </Card>
          )}
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
                      <ReliabilityChip r={reqReliability.data?.[r.user_id]} />
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
          {!!myRole && <TeamOfMonth groupId={id} groupName={g.name} />}
          <SectionTitle title="Activity" />
          {feed.data?.pages.flat().map((item) => <FeedItemCard key={item.id} item={item} />)}
          {!!feed.data && feed.data.pages[0].length === 0 && <Text variant="small" tone="muted">Results, MOTMs and achievements will show up here.</Text>}
          {!!feed.hasNextPage && <Button title="Show more" variant="ghost" onPress={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage} />}
        </View>
      )}

      {tab === 'games' && (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Coming up" />
          {upcoming.length === 0 && <EmptyState icon="calendar-outline" title="No upcoming fixtures" action={myRole ? { label: 'Create a session', onPress: () => router.push({ pathname: '/session/new', params: { groupId: id } }) } : undefined} />}
          {upcoming.map((s) => <SessionCard key={s.id} session={s} />)}
        </View>
      )}

      {tab === 'games' && (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Results" />
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
              {!!balances.data?.get(m.user_id) && <Badge label={`owes ${formatPence(balances.data.get(m.user_id)!)}`} tone="warning" align="center" />}
              {m.role !== 'member' && <Badge label={m.role} tone={m.role === 'owner' ? 'primary' : 'neutral'} align="center" />}
              {canRemove(m.user_id, m.role) && (
                <IconButton icon="person-remove-outline" label={`Remove ${m.profile.display_name}`} size={32} tone="danger" onPress={() => removeMember(m.user_id, m.profile.display_name)} />
              )}
            </Row>
          ))}
        </Card>
        {!!invites.data?.length && (
          <View style={{ gap: space.sm }}>
            <SectionTitle title={`Invited · waiting for a reply · ${invites.data.length}`} />
            <Card padded={false}>
              {invites.data.map((inv, i) => (
                <Row key={inv.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Avatar uri={inv.profile?.avatar_url} name={inv.profile?.display_name ?? '?'} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text variant="smallStrong">{inv.profile?.display_name}</Text>
                    <Text variant="caption" tone="muted">Invited {formatDate(inv.created_at)}{inv.invited_by ? ` by ${members.find((m) => m.user_id === inv.invited_by)?.profile.display_name ?? 'a member'}` : ''}</Text>
                  </View>
                  {(isAdmin || inv.invited_by === userId) && (
                    <Button title="Cancel" size="sm" variant="ghost" loading={busy === `ci-${inv.user_id}`}
                      onPress={() => run(`ci-${inv.user_id}`, async () => { await rpc('cancel_group_invite', { p_group: id, p_user: inv.user_id }); invites.refetch(); }, 'Invitation cancelled')} />
                  )}
                </Row>
              ))}
            </Card>
          </View>
        )}
        {!!myRole && (isAdmin || settings?.late_fines_enabled) && (
          <View style={{ gap: space.sm }}>
            <SectionTitle title="Late fines" />
            <FinesPanel groupId={id} isAdmin={isAdmin} />
          </View>
        )}
        {!!myRole && myRole !== 'owner' && <Button title="Leave group" icon="exit-outline" variant="ghost" loading={busy === 'leave'} onPress={leave} />}
        {myRole === 'owner' && <Text variant="caption" tone="faint" align="center">You own this group. To leave, hand it to another member first (Group settings → tap them under Members → Transfer ownership).</Text>}
        </View>
      )}

      {tab === 'history' && (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Awards" />
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
                        <Text variant="caption" tone="muted">{a.profile.display_name} · {Number(a.value)} ({plural(a.appearances, 'app')})</Text>
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

      {tab === 'history' && (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Seasons" />
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


      {tab === 'history' && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Records" />
          {!!records.isLoading && <Loading />}
          {!!records.error && <ErrorState error={records.error} onRetry={records.refetch} compact />}
          {!!records.data && ([
            ['Highest-scoring game', records.data.highest_scoring_fixture, (r: any) => `${r.score} · ${r.name}, ${formatDate(r.date)}`],
            ['Biggest victory', records.data.biggest_victory, (r: any) => `${r.score} · ${r.name}, ${formatDate(r.date)}`],
            ['Most goals in a session', records.data.most_goals_in_session, (r: any) => `${r.user.display_name} · ${plural(r.value, 'goal')}`],
            ['Highest session rating', records.data.highest_session_rating, (r: any) => `${r.user.display_name} · ${Number(r.value).toFixed(1)}`],
            ['Most consecutive wins', records.data.most_consecutive_wins, (r: any) => `${r.user.display_name} · ${plural(r.value, 'game')}`],
            ['Longest unbeaten run', records.data.longest_unbeaten, (r: any) => `${r.user.display_name} · ${plural(r.value, 'game')}`],
            ['Most MOTM in a season', records.data.most_motm_in_season, (r: any) => `${r.user.display_name} · ${r.value} (${r.season})`],
            ['All-time top scorer', records.data.top_scorer, (r: any) => `${r.user.display_name} · ${plural(r.value, 'goal')}`],
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

      <Coachmarks steps={tourSteps} visible={tourOpen || firstTour.due} onDone={endTour} finishLabel={isNew === '1' ? 'Invite my squad' : 'Got it'} />
      <Sheet visible={inviteOpen} onClose={() => { setInviteOpen(false); setPicked(new Set()); }} title={`Invite players to ${g.name}`}>
        <ScrollView contentContainerStyle={{ gap: space.md }}>
          {canAdd ? (
            <>
              <Text variant="smallStrong" tone="muted">Your friends</Text>
              <PeoplePicker
                people={addableFriends}
                selected={picked}
                onToggle={(uid) => setPicked((p) => toggleIn(p, uid))}
                emptyText={friends.data?.friends.length ? 'All your friends are already in this group or invited.' : 'No friends yet — add some from the Friends screen, or share the link below.'}
              />
              <Text variant="caption" tone="faint">They’ll get an invitation and join once they accept.</Text>
              <Button title={picked.size ? `Invite ${picked.size} to the group` : 'Send invitations'} icon="mail-outline" disabled={!picked.size} loading={busy === 'add-members'}
                onPress={async () => {
                  const n = await run('add-members', () => rpc<number>('add_group_members', { p_group: id, p_users: [...picked] }), (count) => (count ? `${count} invitation${count === 1 ? '' : 's'} sent` : 'Already invited'));
                  if (n !== undefined) { setPicked(new Set()); setInviteOpen(false); invites.refetch(); }
                }} />
            </>
          ) : (
            <Text variant="small" tone="muted">Only admins can invite people to this invite-only group.</Text>
          )}
          <Text variant="smallStrong" tone="muted">Not friends yet or not on MATCHDAY?</Text>
          <Text variant="caption" tone="faint">Share this link or let them scan the QR code. It expires in 7 days.</Text>
          <InviteQr kind="group" targetId={id} message={`Join ${g.name} on MATCHDAY`} />
        </ScrollView>
      </Sheet>
      <Sheet visible={seasonOpen} onClose={() => setSeasonOpen(false)} title="New season">
        <Input label="Name" value={season.name} onChangeText={(v) => setSeason((s) => ({ ...s, name: v }))} placeholder={`e.g. Season ${seasons.length + 1} — ${new Date().getFullYear()}`} />
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
