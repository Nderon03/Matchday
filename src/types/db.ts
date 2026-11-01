/** Hand-maintained types matching supabase/migrations. Regenerate with `npm run db:types` once linked. */
export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD' | 'ANY';
export type ProfileVisibility = 'public' | 'friends' | 'private';
export type GroupVisibility = 'public' | 'private';
export type GroupJoinPolicy = 'open' | 'request' | 'invite_only';
export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';
export type SessionVisibility = 'public' | 'group' | 'private';
export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'finalised' | 'cancelled';
export type SessionMode = 'single' | 'multi';
export type MotmMode = 'session' | 'fixture';
export type RsvpStatus = 'confirmed' | 'waitlisted' | 'declined' | 'unavailable' | 'withdrawn' | 'removed';
export type VerificationStatus = 'unverified' | 'verified' | 'absent';
export type PaymentMode = 'free' | 'upfront' | 'after';
export type PaymentStatus = 'unpaid' | 'pending' | 'authorised' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded' | 'disputed';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'corrected' | 'clarification_requested';
export type Recurrence = 'none' | 'weekly' | 'fortnightly' | 'monthly';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  position: PlayerPosition;
  onboarded: boolean;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  profile_visibility: ProfileVisibility;
  show_stats: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  notification_prefs: Record<string, boolean>;
  theme: 'dark' | 'light' | 'system';
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  visibility: GroupVisibility;
  join_policy: GroupJoinPolicy;
  location: string | null;
  rules: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GroupSettings {
  group_id: string;
  track_assists: boolean;
  rating_min_votes: number | null;
  leaderboard_min_appearances: number;
  default_motm_mode: MotmMode;
  voting_window_hours: number;
}

export interface Season {
  id: string;
  group_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: 'active' | 'completed';
}

export interface Session {
  id: string;
  group_id: string | null;
  host_id: string | null;
  template_id: string | null;
  season_id: string | null;
  name: string;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  venue: string | null;
  format_size: number;
  max_attendance: number;
  visibility: SessionVisibility;
  description: string | null;
  payment_mode: PaymentMode;
  price_pence: number;
  currency: string;
  mode: SessionMode;
  motm_mode: MotmMode;
  status: SessionStatus;
  rsvp_deadline: string | null;
  voting_closes_at: string | null;
  completed_at: string | null;
  finalised_at: string | null;
  host_confirmed_at: string | null;
}

export interface Attendance {
  session_id: string;
  user_id: string;
  status: RsvpStatus;
  waitlisted_at: string | null;
  checked_in_at: string | null;
  verification: VerificationStatus;
  late_arrival: boolean;
  replacement_for: string | null;
  removed_reason?: string | null;
  removed_at?: string | null;
}

export interface Fixture {
  id: string;
  session_id: string;
  number: number;
  played: boolean;
  lineup_confirmed_at: string | null;
}

export interface FixtureTeam {
  id: string;
  fixture_id: string;
  side: 'A' | 'B';
  name: string;
  colour: string;
  score: number | null;
}

export interface TeamPlayer {
  fixture_team_id: string;
  fixture_id: string;
  /** Registered player, or null for a guest (see guest_id). */
  user_id: string | null;
  guest_id: string | null;
  position: PlayerPosition;
  is_goalkeeper: boolean;
  is_substitute: boolean;
  sort_order: number;
}

export interface GoalSubmission {
  id: string;
  session_id: string;
  user_id: string;
  goals: number;
  assists: number;
  fixture_breakdown: { fixture_id: string; goals: number; assists?: number }[] | null;
  note: string | null;
  status: SubmissionStatus;
  approved_goals: number | null;
  approved_assists: number | null;
  is_late: boolean;
  submitted_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  session_id: string;
  payer_id: string;
  amount_pence: number;
  currency: string;
  mode: 'upfront' | 'after';
  status: PaymentStatus;
  method: 'card' | 'cash';
  receipt_url: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  value: number;
  appearances: number;
  is_me: boolean;
  total: number;
}

export interface ActivityItem {
  id: string;
  actor_id: string | null;
  group_id: string | null;
  session_id: string | null;
  type: string;
  payload: Record<string, any>;
  created_at: string;
}
