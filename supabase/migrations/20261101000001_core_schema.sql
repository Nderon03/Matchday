-- MATCHDAY core schema
-- All primary keys are UUIDs; all tables carry timestamps; constraints enforce
-- the integrity rules that the application relies upon (no self votes, one vote
-- per voter, one rating per rater/ratee pair, etc.).

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.player_position as enum ('GK', 'DEF', 'MID', 'FWD', 'ANY');
create type public.profile_visibility as enum ('public', 'friends', 'private');
create type public.group_visibility as enum ('public', 'private');
create type public.group_join_policy as enum ('open', 'request', 'invite_only');
create type public.group_role as enum ('owner', 'admin', 'moderator', 'member');
create type public.request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
create type public.session_visibility as enum ('public', 'group', 'private');
create type public.session_status as enum ('scheduled', 'in_progress', 'completed', 'finalised', 'cancelled');
create type public.session_mode as enum ('single', 'multi');
create type public.motm_mode as enum ('session', 'fixture');
create type public.rsvp_status as enum ('confirmed', 'waitlisted', 'declined', 'unavailable', 'withdrawn');
create type public.verification_status as enum ('unverified', 'verified', 'absent');
create type public.payment_mode as enum ('free', 'upfront', 'after');
create type public.payment_status as enum (
  'unpaid', 'pending', 'authorised', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'disputed'
);
create type public.submission_status as enum ('pending', 'approved', 'rejected', 'corrected', 'clarification_requested');
create type public.recurrence as enum ('none', 'weekly', 'fortnightly', 'monthly');
create type public.season_status as enum ('active', 'completed');
create type public.team_side as enum ('A', 'B');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  position public.player_position not null default 'ANY',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 40),
  constraint bio_length check (bio is null or char_length(bio) <= 280)
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  profile_visibility public.profile_visibility not null default 'public',
  show_stats boolean not null default true,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  -- per notification type opt-outs, e.g. {"friend_activity": false}
  notification_prefs jsonb not null default '{}'::jsonb,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  updated_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_request check (sender_id <> receiver_id)
);
create unique index friend_requests_one_pending
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index friend_requests_receiver_idx on public.friend_requests (receiver_id, status);

create table public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint ordered_pair check (user_a < user_b)
);
create index friendships_b_idx on public.friendships (user_b);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Shareable invite links (friend, group or session), usable as QR codes.
create table public.invite_links (
  code text primary key default encode(gen_random_bytes(9), 'hex'),
  kind text not null check (kind in ('friend', 'group', 'session')),
  target_id uuid not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 1000),
  logo_url text,
  cover_url text,
  visibility public.group_visibility not null default 'private',
  join_policy public.group_join_policy not null default 'request',
  location text,
  rules text check (rules is null or char_length(rules) <= 4000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_public_idx on public.groups (visibility) where visibility = 'public';

create table public.group_settings (
  group_id uuid primary key references public.groups (id) on delete cascade,
  track_assists boolean not null default true,
  -- null => automatic threshold derived from attendance (see min_ratings_required)
  rating_min_votes int check (rating_min_votes is null or rating_min_votes between 1 and 20),
  leaderboard_min_appearances int not null default 5 check (leaderboard_min_appearances between 1 and 100),
  default_motm_mode public.motm_mode not null default 'session',
  voting_window_hours int not null default 48 check (voting_window_hours between 1 and 336),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create unique index group_one_owner on public.group_members (group_id) where role = 'owner';

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 280),
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index group_join_one_pending on public.group_join_requests (group_id, user_id) where status = 'pending';

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  starts_on date not null,
  ends_on date not null,
  status public.season_status not null default 'active',
  created_at timestamptz not null default now(),
  finalised_at timestamptz,
  constraint season_dates check (ends_on >= starts_on)
);
create index seasons_group_idx on public.seasons (group_id, starts_on);

create table public.season_awards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  award text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value numeric not null,
  appearances int not null,
  created_at timestamptz not null default now(),
  unique (season_id, award, user_id)
);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create table public.session_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  format_size int not null check (format_size between 5 and 11),
  location text,
  venue text,
  max_attendance int check (max_attendance is null or max_attendance between 2 and 60),
  visibility public.session_visibility not null default 'private',
  description text,
  payment_mode public.payment_mode not null default 'free',
  price_pence int not null default 0 check (price_pence between 0 and 10000),
  recurrence public.recurrence not null default 'none',
  start_time time not null default '19:00',
  duration_minutes int not null default 60 check (duration_minutes between 15 and 480),
  invitee_ids uuid[] not null default '{}',
  auto_schedule boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index session_templates_owner_idx on public.session_templates (owner_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete set null,
  host_id uuid references public.profiles (id) on delete set null,
  template_id uuid references public.session_templates (id) on delete set null,
  season_id uuid references public.seasons (id) on delete set null,
  name text not null check (char_length(name) between 2 and 60),
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 15 and 480),
  location text,
  venue text,
  format_size int not null check (format_size between 5 and 11),
  max_attendance int not null check (max_attendance between 2 and 60),
  visibility public.session_visibility not null default 'private',
  description text check (description is null or char_length(description) <= 1000),
  payment_mode public.payment_mode not null default 'free',
  price_pence int not null default 0 check (price_pence between 0 and 10000),
  currency text not null default 'gbp',
  mode public.session_mode not null default 'single',
  motm_mode public.motm_mode not null default 'session',
  status public.session_status not null default 'scheduled',
  rsvp_deadline timestamptz,
  voting_closes_at timestamptz,
  completed_at timestamptz,
  finalised_at timestamptz,
  host_confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_has_price check (payment_mode = 'free' or price_pence >= 100),
  constraint group_visibility_needs_group check (visibility <> 'group' or group_id is not null)
);
create index sessions_group_idx on public.sessions (group_id, starts_at desc);
create index sessions_host_idx on public.sessions (host_id, starts_at desc);
create index sessions_status_idx on public.sessions (status, starts_at);

create table public.session_hosts (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.session_invitations (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index session_invitations_user_idx on public.session_invitations (user_id);

-- One row per player per session: their RSVP, waiting-list position,
-- self check-in and the host's verification decision.
create table public.session_attendance (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  responded_at timestamptz not null default now(),
  waitlisted_at timestamptz,
  checked_in_at timestamptz,
  verification public.verification_status not null default 'unverified',
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  late_arrival boolean not null default false,
  replacement_for uuid references public.profiles (id) on delete set null,
  primary key (session_id, user_id),
  constraint waitlist_timestamp check (status <> 'waitlisted' or waitlisted_at is not null),
  constraint verified_must_be_confirmed check (verification <> 'verified' or status = 'confirmed')
);
create index session_attendance_user_idx on public.session_attendance (user_id, status);
create index session_attendance_waitlist_idx on public.session_attendance (session_id, waitlisted_at) where status = 'waitlisted';

-- ---------------------------------------------------------------------------
-- Fixtures and line-ups
-- ---------------------------------------------------------------------------
create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  number int not null check (number between 1 and 50),
  played boolean not null default false,
  result_recorded_by uuid references public.profiles (id) on delete set null,
  result_recorded_at timestamptz,
  lineup_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, number)
);

create table public.fixture_teams (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  side public.team_side not null,
  name text not null,
  colour text not null default '#22C55E',
  score int check (score is null or score between 0 and 99),
  unique (fixture_id, side)
);

create table public.team_players (
  fixture_team_id uuid not null references public.fixture_teams (id) on delete cascade,
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position public.player_position not null default 'ANY',
  is_goalkeeper boolean not null default false,
  is_substitute boolean not null default false,
  sort_order int not null default 0,
  primary key (fixture_team_id, user_id),
  -- a player can only appear for one side within a fixture
  unique (fixture_id, user_id)
);
create index team_players_user_idx on public.team_players (user_id);

-- ---------------------------------------------------------------------------
-- Goals, ratings and votes
-- ---------------------------------------------------------------------------
create table public.goal_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goals int not null check (goals between 0 and 50),
  assists int not null default 0 check (assists between 0 and 50),
  -- optional [{fixture_id, goals, assists}]
  fixture_breakdown jsonb,
  note text check (note is null or char_length(note) <= 280),
  status public.submission_status not null default 'pending',
  approved_goals int,
  approved_assists int,
  is_late boolean not null default false,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create index goal_submissions_status_idx on public.goal_submissions (session_id, status);

-- Append-only review trail for goal submissions.
create table public.goal_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.goal_submissions (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  action public.submission_status not null,
  goals int,
  assists int,
  reason text,
  created_at timestamptz not null default now()
);

-- Official goal contributions; only ever written by approval functions.
create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  fixture_id uuid references public.fixtures (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  submission_id uuid references public.goal_submissions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index player_goals_session_idx on public.player_goals (session_id, user_id);

create table public.player_ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  ratee_id uuid not null references public.profiles (id) on delete cascade,
  score int not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  unique (session_id, rater_id, ratee_id),
  constraint no_self_rating check (rater_id <> ratee_id)
);
create index player_ratings_ratee_idx on public.player_ratings (session_id, ratee_id);

create table public.motm_votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  fixture_id uuid references public.fixtures (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  nominee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint no_self_vote check (voter_id <> nominee_id)
);
create unique index motm_one_vote_per_session
  on public.motm_votes (session_id, voter_id) where fixture_id is null;
create unique index motm_one_vote_per_fixture
  on public.motm_votes (fixture_id, voter_id) where fixture_id is not null;

create table public.motm_awards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  fixture_id uuid references public.fixtures (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  votes int not null,
  shared boolean not null default false,
  decided_by_host boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index motm_awards_unique on public.motm_awards (session_id, coalesce(fixture_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);

-- Materialised per-player per-session statistics. Always derived from the
-- verified records above by compute_session_statistics(); never edited directly.
create table public.session_player_statistics (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  season_id uuid references public.seasons (id) on delete set null,
  played_at timestamptz not null,
  fixtures_played int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  rating_avg numeric(4, 2),
  rating_count int not null default 0,
  rating_eligible boolean not null default false,
  motm boolean not null default false,
  motm_shared boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index sps_user_idx on public.session_player_statistics (user_id, played_at desc);
create index sps_group_idx on public.session_player_statistics (group_id, played_at desc);
create index sps_season_idx on public.session_player_statistics (season_id);

create table public.achievements (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null,
  threshold int not null default 1,
  repeatable boolean not null default false,
  sort_order int not null default 0
);

create table public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_code text not null references public.achievements (code),
  session_id uuid references public.sessions (id) on delete set null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_code)
);

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------
create table public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_feed_actor_idx on public.activity_feed (actor_id, created_at desc);
create index activity_feed_group_idx on public.activity_feed (group_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_feed (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index comments_activity_idx on public.comments (activity_id, created_at);

create table public.reactions (
  activity_id uuid not null references public.activity_feed (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('like', 'fire', 'goal', 'clap', 'laugh')),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id, emoji)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_status text not null default 'skipped' check (push_status in ('queued', 'sent', 'failed', 'skipped')),
  email_status text not null default 'skipped' check (email_status in ('queued', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_push_queue_idx on public.notifications (created_at) where push_status = 'queued';
create index notifications_email_queue_idx on public.notifications (created_at) where email_status = 'queued';

-- ---------------------------------------------------------------------------
-- Payments (Stripe Connect). Card data never touches MATCHDAY.
-- ---------------------------------------------------------------------------
create table public.payment_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  payer_id uuid not null references public.profiles (id) on delete cascade,
  payee_id uuid references public.profiles (id) on delete set null,
  amount_pence int not null check (amount_pence > 0),
  application_fee_pence int not null default 0,
  currency text not null default 'gbp',
  mode public.payment_mode not null check (mode in ('upfront', 'after')),
  status public.payment_status not null default 'unpaid',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  receipt_url text,
  failure_reason text,
  authorised_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, payer_id)
);
create index payments_payer_idx on public.payments (payer_id, created_at desc);
create index payments_status_idx on public.payments (status);

-- Every verified webhook event, stored once (idempotency key = Stripe event id).
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  payment_id uuid references public.payments (id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  stripe_refund_id text unique,
  amount_pence int not null check (amount_pence > 0),
  status text not null default 'pending',
  reason text,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payout_records (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  host_id uuid references public.profiles (id) on delete set null,
  stripe_reference text,
  amount_pence int not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'comment', 'activity', 'group')),
  target_id uuid not null,
  group_id uuid references public.groups (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  group_id uuid references public.groups (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at);

create table public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket, window_start)
);
