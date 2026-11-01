/** Data-access hooks. All reads go through RLS; all writes through RPCs (see lib/api). */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { q, rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeInvalidate } from './useRealtime';
import type {
  ActivityItem, Attendance, Fixture, FixtureTeam, GoalSubmission, Group, GroupRole, GroupSettings, LeaderboardRow,
  Notification, Payment, PaymentStatus, Profile, Season, Session, TeamPlayer, UserPreferences,
} from '@/types/db';
import type { LeaderboardCategory } from '@/domain/leaderboard';

export const keys = {
  home: ['home'] as const,
  tasks: ['tasks'] as const,
  notifications: ['notifications'] as const,
  session: (id: string) => ['session', id] as const,
  mySessions: ['sessions', 'mine'] as const,
  groups: ['groups', 'mine'] as const,
  group: (id: string) => ['group', id] as const,
  player: (id: string, groupId?: string | null) => ['player', id, groupId ?? null] as const,
  friends: ['friends'] as const,
  feed: (groupId?: string | null) => ['feed', groupId ?? 'all'] as const,
  leaderboard: (p: object) => ['leaderboard', p] as const,
  templates: ['templates'] as const,
  prefs: ['prefs'] as const,
};

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'position'>;
const PROFILE_COLS = 'id, username, display_name, avatar_url, position';

export function useHome() {
  const { userId } = useAuth();
  useRealtimeInvalidate('home', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], [keys.home], !!userId);
  return useQuery({ queryKey: keys.home, queryFn: () => rpc<any>('get_home_dashboard'), enabled: !!userId });
}

export interface Task { kind: string; session_id: string; title: string; subtitle: string; due_at: string | null; count: number }
export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: () => rpc<Task[]>('get_pending_tasks') });
}

export function useNotifications() {
  const { userId } = useAuth();
  useRealtimeInvalidate('notifications', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], [keys.notifications], !!userId);
  return useQuery({
    queryKey: keys.notifications,
    enabled: !!userId,
    queryFn: () => q<Notification[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
  });
}

export interface SessionDetail {
  session: Session;
  group: Pick<Group, 'id' | 'name' | 'logo_url'> | null;
  host: PublicProfile | null;
  attendance: (Attendance & { profile: PublicProfile })[];
  invited: PublicProfile[];
  fixtures: (Fixture & { teams: (FixtureTeam & { players: TeamPlayer[] })[] })[];
  coHostIds: string[];
  submissions: GoalSubmission[];
  approvedGoals: { user_id: string; goals: number; assists: number }[];
  /** Approved goals/assists per fixture (null fixture = not broken down by game). */
  goalsByFixture: { fixture_id: string | null; user_id: string; goals: number; assists: number }[];
  guests: SessionGuest[];
  payments: { user_id: string; status: PaymentStatus; method: string }[];
  motm: { user_id: string; fixture_id: string | null; votes: number; shared: boolean }[];
  stats: { user_id: string; rating_avg: number | null; rating_eligible: boolean; goals: number; motm: boolean }[];
  isManager: boolean;
  me: (Attendance & { profile: PublicProfile }) | undefined;
}

export interface SessionGuest {
  id: string;
  session_id: string;
  name: string;
  added_by: string | null;
  status: 'confirmed' | 'pending' | 'removed' | 'declined' | 'withdrawn';
  created_at: string;
}

export function useSessionDetail(id: string) {
  const { userId } = useAuth();
  useRealtimeInvalidate(
    `session-${id}`,
    [
      { table: 'session_attendance', filter: `session_id=eq.${id}` },
      { table: 'fixtures', filter: `session_id=eq.${id}` },
      { table: 'sessions', filter: `id=eq.${id}` },
      { table: 'goal_submissions', filter: `session_id=eq.${id}` },
      { table: 'session_guests', filter: `session_id=eq.${id}` },
      { table: 'payments', filter: `session_id=eq.${id}` },
      { table: 'team_players' },
      { table: 'fixture_teams' },
    ],
    [keys.session(id)],
    !!id,
  );
  return useQuery({
    queryKey: keys.session(id),
    enabled: !!id && !!userId,
    queryFn: async (): Promise<SessionDetail> => {
      const session = await q<Session>(supabase.from('sessions').select('*').eq('id', id).single());
      const [attendance, invites, fixtures, hosts, submissions, goals, payments, motm, stats, isManager, group, host, guests] = await Promise.all([
        q<any[]>(supabase.from('session_attendance').select(`*, profile:profiles!session_attendance_user_id_fkey(${PROFILE_COLS})`).eq('session_id', id)),
        q<any[]>(supabase.from('session_invitations').select(`profile:profiles!session_invitations_user_id_fkey(${PROFILE_COLS})`).eq('session_id', id)),
        q<any[]>(supabase.from('fixtures').select('*, teams:fixture_teams(*, players:team_players(*))').eq('session_id', id).order('number')),
        q<any[]>(supabase.from('session_hosts').select('user_id').eq('session_id', id)),
        q<GoalSubmission[]>(supabase.from('goal_submissions').select('*').eq('session_id', id)),
        q<any[]>(supabase.from('player_goals').select('user_id, fixture_id, goals, assists').eq('session_id', id)),
        rpc<any[]>('get_session_payment_statuses', { p_session: id }).catch(() => []),
        q<any[]>(supabase.from('motm_awards').select('user_id, fixture_id, votes, shared').eq('session_id', id)),
        q<any[]>(supabase.from('session_player_statistics').select('user_id, rating_avg, rating_eligible, goals, motm').eq('session_id', id)),
        rpc<boolean>('is_session_manager', { p_session: id }),
        session.group_id ? q<any>(supabase.from('groups').select('id, name, logo_url').eq('id', session.group_id).maybeSingle()) : Promise.resolve(null),
        session.host_id ? q<any>(supabase.from('profiles').select(PROFILE_COLS).eq('id', session.host_id).maybeSingle()) : Promise.resolve(null),
        q<SessionGuest[]>(supabase.from('session_guests').select('*').eq('session_id', id).order('created_at')),
      ]);
      const approved = new Map<string, { user_id: string; goals: number; assists: number }>();
      for (const g of goals) {
        const cur = approved.get(g.user_id) ?? { user_id: g.user_id, goals: 0, assists: 0 };
        cur.goals += g.goals;
        cur.assists += g.assists;
        approved.set(g.user_id, cur);
      }
      for (const f of fixtures) f.teams.sort((a: FixtureTeam, b: FixtureTeam) => a.side.localeCompare(b.side));
      return {
        session,
        group,
        host,
        attendance,
        invited: invites.map((i) => i.profile).filter(Boolean),
        fixtures,
        coHostIds: hosts.map((h) => h.user_id),
        submissions,
        approvedGoals: [...approved.values()],
        goalsByFixture: goals.map((g: any) => ({ fixture_id: g.fixture_id, user_id: g.user_id, goals: g.goals, assists: g.assists })),
        guests,
        payments: payments.map((p: any) => ({ user_id: p.user_id, status: p.status, method: p.method })),
        motm,
        stats,
        isManager,
        me: attendance.find((a) => a.user_id === userId),
      };
    },
  });
}

export interface SessionListItem extends Session {
  my_status?: string;
  confirmed_count: number;
  group?: { name: string } | null;
}

export function useMySessions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: keys.mySessions,
    enabled: !!userId,
    queryFn: async () => {
      const [att, inv] = await Promise.all([
        q<any[]>(supabase.from('session_attendance').select('session_id, status').eq('user_id', userId!)),
        q<any[]>(supabase.from('session_invitations').select('session_id').eq('user_id', userId!)),
      ]);
      const ids = [...new Set([...att.map((a) => a.session_id), ...inv.map((i) => i.session_id)])];
      if (!ids.length) return [] as SessionListItem[];
      const sessions = await q<any[]>(
        supabase.from('sessions').select('*, group:groups(name), attendance:session_attendance(status)').in('id', ids).order('starts_at', { ascending: false }).limit(200),
      );
      const mine = new Map(att.map((a) => [a.session_id, a.status]));
      return sessions.map((s) => ({
        ...s,
        my_status: mine.get(s.id),
        confirmed_count: (s.attendance ?? []).filter((a: any) => a.status === 'confirmed').length,
      })) as SessionListItem[];
    },
  });
}

export interface MyGroup extends Group { role: GroupRole; member_count: number }
export function useMyGroups() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: keys.groups,
    enabled: !!userId,
    queryFn: async () => {
      const rows = await q<any[]>(supabase.from('group_members').select('role, group:groups(*, group_members(count))').eq('user_id', userId!));
      return rows
        .filter((r) => r.group)
        .map((r) => ({ ...r.group, role: r.role, member_count: r.group.group_members?.[0]?.count ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name)) as MyGroup[];
    },
  });
}

export interface GroupDetail {
  group: Group;
  settings: GroupSettings | null;
  members: { user_id: string; role: GroupRole; joined_at: string; profile: PublicProfile }[];
  seasons: Season[];
  myRole: GroupRole | null;
  joinRequests: { id: string; user_id: string; message: string | null; created_at: string; profile: PublicProfile }[];
}

export function useGroup(id: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: keys.group(id),
    enabled: !!id && !!userId,
    queryFn: async (): Promise<GroupDetail> => {
      const [group, settings, members, seasons, requests] = await Promise.all([
        q<Group>(supabase.from('groups').select('*').eq('id', id).single()),
        q<GroupSettings | null>(supabase.from('group_settings').select('*').eq('group_id', id).maybeSingle()),
        q<any[]>(supabase.from('group_members').select(`user_id, role, joined_at, profile:profiles(${PROFILE_COLS})`).eq('group_id', id)),
        q<Season[]>(supabase.from('seasons').select('*').eq('group_id', id).order('starts_on', { ascending: false })),
        q<any[]>(supabase.from('group_join_requests').select(`id, user_id, message, created_at, profile:profiles!group_join_requests_user_id_fkey(${PROFILE_COLS})`).eq('group_id', id).eq('status', 'pending')),
      ]);
      const order: Record<GroupRole, number> = { owner: 0, admin: 1, moderator: 2, member: 3 };
      members.sort((a, b) => order[a.role as GroupRole] - order[b.role as GroupRole] || a.profile.display_name.localeCompare(b.profile.display_name));
      return { group, settings, members, seasons, myRole: members.find((m) => m.user_id === userId)?.role ?? null, joinRequests: requests };
    },
  });
}

export function useGroupSessions(groupId: string) {
  return useQuery({
    queryKey: ['group', groupId, 'sessions'],
    queryFn: () =>
      q<any[]>(
        supabase.from('sessions').select('*, fixtures(id, number, played, teams:fixture_teams(side, score))').eq('group_id', groupId).neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(100),
      ),
  });
}

export function useLeaderboard(p: { category: LeaderboardCategory; scope: 'group' | 'friends' | 'global'; groupId?: string | null; seasonId?: string | null; period?: 'all' | 'month' | 'year' }) {
  const { userId } = useAuth();
  return useInfiniteQuery({
    queryKey: keys.leaderboard(p),
    enabled: !!userId && (p.scope !== 'group' || !!p.groupId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      rpc<LeaderboardRow[]>('get_leaderboard', {
        p_category: p.category, p_scope: p.scope, p_group: p.groupId ?? null, p_season: p.seasonId ?? null,
        p_period: p.period ?? 'all', p_limit: 50, p_offset: pageParam,
      }),
    getNextPageParam: (last, all) => (last.length === 50 ? all.length * 50 : undefined),
  });
}

export function usePlayerProfile(id: string, groupId?: string | null) {
  return useQuery({ queryKey: keys.player(id, groupId), enabled: !!id, queryFn: () => rpc<any>('get_player_profile', { p_user: id, p_group: groupId ?? null }) });
}

export function useFriends() {
  const { userId } = useAuth();
  useRealtimeInvalidate('friends', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], [keys.friends], !!userId);
  return useQuery({
    queryKey: keys.friends,
    enabled: !!userId,
    queryFn: async () => {
      const [friendships, incoming, outgoing, blocked] = await Promise.all([
        q<any[]>(supabase.from('friendships').select(`user_a, user_b, a:profiles!friendships_user_a_fkey(${PROFILE_COLS}), b:profiles!friendships_user_b_fkey(${PROFILE_COLS})`).or(`user_a.eq.${userId},user_b.eq.${userId}`)),
        q<any[]>(supabase.from('friend_requests').select(`id, created_at, profile:profiles!friend_requests_sender_id_fkey(${PROFILE_COLS})`).eq('receiver_id', userId!).eq('status', 'pending')),
        q<any[]>(supabase.from('friend_requests').select(`id, created_at, profile:profiles!friend_requests_receiver_id_fkey(${PROFILE_COLS})`).eq('sender_id', userId!).eq('status', 'pending')),
        q<any[]>(supabase.from('user_blocks').select(`blocked_id, profile:profiles!user_blocks_blocked_id_fkey(${PROFILE_COLS})`).eq('blocker_id', userId!)),
      ]);
      return {
        friends: friendships.map((f) => (f.user_a === userId ? f.b : f.a)).filter(Boolean).sort((x: PublicProfile, y: PublicProfile) => x.display_name.localeCompare(y.display_name)) as PublicProfile[],
        incoming: incoming as { id: string; created_at: string; profile: PublicProfile }[],
        outgoing: outgoing as { id: string; created_at: string; profile: PublicProfile }[],
        blocked: blocked.map((b) => b.profile).filter(Boolean) as PublicProfile[],
      };
    },
  });
}

export interface FeedItem extends ActivityItem {
  actor: PublicProfile | null;
  group: { name: string } | null;
  reactions: { user_id: string; emoji: string }[];
  comments: { count: number }[];
}

export function useFeed(groupId?: string | null) {
  const { userId } = useAuth();
  useRealtimeInvalidate(`feed-${groupId ?? 'all'}`, [{ table: 'activity_feed', ...(groupId ? { filter: `group_id=eq.${groupId}` } : {}) }], [keys.feed(groupId)], !!userId);
  return useInfiniteQuery({
    queryKey: keys.feed(groupId),
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('activity_feed')
        .select(`*, actor:profiles(${PROFILE_COLS}), group:groups(name), reactions(user_id, emoji), comments(count)`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (groupId) query = query.eq('group_id', groupId);
      if (pageParam) query = query.lt('created_at', pageParam);
      return q<FeedItem[]>(query);
    },
    getNextPageParam: (last) => (last.length === 20 ? last[last.length - 1].created_at : undefined),
  });
}

export function usePreferences() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: keys.prefs,
    enabled: !!userId,
    queryFn: () => q<UserPreferences>(supabase.from('user_preferences').select('*').eq('user_id', userId!).single()),
  });
}

export function useTemplates() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: keys.templates,
    enabled: !!userId,
    queryFn: () => q<any[]>(supabase.from('session_templates').select('*, group:groups(name)').eq('owner_id', userId!).order('updated_at', { ascending: false })),
  });
}

export function useMyPayments() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['payments', 'mine'],
    enabled: !!userId,
    queryFn: () => q<(Payment & { session: { id: string; name: string; starts_at: string } })[]>(
      supabase.from('payments').select('*, session:sessions(id, name, starts_at)').eq('payer_id', userId!).order('created_at', { ascending: false }),
    ),
  });
}
