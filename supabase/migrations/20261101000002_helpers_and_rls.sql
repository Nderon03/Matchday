-- Helper functions, triggers and Row Level Security policies.
-- Helpers are SECURITY DEFINER so policies can call them without recursive RLS.

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger prefs_touch before update on public.user_preferences for each row execute function public.touch_updated_at();
create trigger groups_touch before update on public.groups for each row execute function public.touch_updated_at();
create trigger group_settings_touch before update on public.group_settings for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();
create trigger templates_touch before update on public.session_templates for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.goal_submissions for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger payment_accounts_touch before update on public.payment_accounts for each row execute function public.touch_updated_at();
create trigger refunds_touch before update on public.refunds for each row execute function public.touch_updated_at();

-- Raise a client-facing error with a stable code the app can map to copy.
create or replace function public.raise_app_error(p_code text, p_message text)
returns void language plpgsql as $$
begin
  raise exception '%', p_message using errcode = 'P0001', hint = p_code;
end $$;

create or replace function public.require_user()
returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then
    perform public.raise_app_error('not_authenticated', 'You need to be signed in.');
  end if;
  return v;
end $$;

-- Append-only audit log.
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id uuid, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, data)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();
create trigger goal_reviews_immutable before update or delete on public.goal_reviews
  for each row when (pg_trigger_depth() < 1) execute function public.prevent_audit_mutation();

-- Fixed-window rate limiter. Raises when the caller exceeds p_max hits per window.
create or replace function public.check_rate_limit(p_bucket text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  v_hits int;
begin
  if v_uid is null then return; end if;
  insert into public.rate_limits (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start) do update set hits = rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    perform public.raise_app_error('rate_limited', 'You are doing that too often. Please wait a moment and try again.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Relationship helpers
-- ---------------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships where user_a = least(a, b) and user_b = greatest(a, b));
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.group_role_of(p_group uuid, p_user uuid default auth.uid())
returns public.group_role language sql stable security definer set search_path = public as $$
  select role from public.group_members where group_id = p_group and user_id = p_user;
$$;

create or replace function public.is_group_member(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = p_user);
$$;

create or replace function public.is_group_admin(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = p_user and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_moderator(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = p_user and role in ('owner', 'admin', 'moderator')
  );
$$;

create or replace function public.can_view_group(p_group uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group
      and (g.visibility = 'public' or public.is_group_member(g.id, p_user))
  );
$$;

-- Session managers: host, co-hosts and the owning group's owner/admins.
create or replace function public.is_session_manager(p_session uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session
      and (
        s.host_id = p_user
        or exists (select 1 from public.session_hosts h where h.session_id = s.id and h.user_id = p_user)
        or (s.group_id is not null and public.is_group_admin(s.group_id, p_user))
      )
  );
$$;

create or replace function public.is_verified_participant(p_session uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.session_attendance
    where session_id = p_session and user_id = p_user and status = 'confirmed' and verification = 'verified'
  );
$$;

create or replace function public.can_view_session(p_session uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session
      and (
        s.visibility = 'public'
        or public.is_session_manager(s.id, p_user)
        or exists (select 1 from public.session_invitations i where i.session_id = s.id and i.user_id = p_user)
        or exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = p_user)
        or (s.visibility = 'group' and public.is_group_member(s.group_id, p_user))
      )
  );
$$;

create or replace function public.session_of_fixture(p_fixture uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select session_id from public.fixtures where id = p_fixture;
$$;

create or replace function public.can_view_activity(p_activity uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.activity_feed f
    where f.id = p_activity
      and not public.is_blocked_between(coalesce(f.actor_id, p_user), p_user)
      and (
        f.actor_id = p_user
        or (f.group_id is not null and public.can_view_group(f.group_id, p_user))
        or (f.group_id is null and f.session_id is not null and public.can_view_session(f.session_id, p_user))
        or (f.group_id is null and f.session_id is null and f.actor_id is not null and public.are_friends(f.actor_id, p_user))
      )
  );
$$;

-- Can p_viewer see p_user's statistics / full profile?
create or replace function public.can_view_profile_details(p_user uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = p_viewer
    or (
      not public.is_blocked_between(p_user, p_viewer)
      and coalesce((
        select case up.profile_visibility
          when 'public' then up.show_stats
          when 'friends' then up.show_stats and public.are_friends(p_user, p_viewer)
          else false end
        from public.user_preferences up where up.user_id = p_user
      ), true)
    );
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + preferences created from auth metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '', 'g'));
  v_display text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), '');
  v_base text;
  v_try int := 0;
begin
  if char_length(v_username) < 3 or char_length(v_username) > 20
     or exists (select 1 from public.profiles where username = v_username) then
    v_base := left(coalesce(nullif(lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g')), ''), 'player'), 14);
    if char_length(v_base) < 3 then v_base := 'player'; end if;
    loop
      v_username := v_base || lpad((floor(random() * 100000))::int::text, 5, '0');
      exit when not exists (select 1 from public.profiles where username = v_username);
      v_try := v_try + 1;
      if v_try > 20 then v_username := 'p' || left(replace(new.id::text, '-', ''), 19); exit; end if;
    end loop;
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, coalesce(left(v_display, 40), v_username));
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Group bootstrap: owner membership + settings row.
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_settings (group_id) values (new.id);
  if new.created_by is not null then
    insert into public.group_members (group_id, user_id, role) values (new.id, new.created_by, 'owner');
  end if;
  return new;
end $$;
create trigger on_group_created after insert on public.groups
  for each row execute function public.handle_new_group();

-- Prevent users escalating fields they must not edit directly.
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'Immutable profile field';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Policy philosophy: reads are scoped by relationship; writes to anything that
-- affects other players or statistics go through SECURITY DEFINER RPCs only.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','push_tokens','friend_requests','friendships','user_blocks','invite_links',
    'groups','group_settings','group_members','group_join_requests','seasons','season_awards',
    'session_templates','sessions','session_hosts','session_invitations','session_attendance',
    'fixtures','fixture_teams','team_players','goal_submissions','goal_reviews','player_goals',
    'player_ratings','motm_votes','motm_awards','session_player_statistics','achievements','player_achievements',
    'activity_feed','comments','reactions','notifications',
    'payment_accounts','payments','payment_events','refunds','payout_records',
    'reports','moderation_actions','audit_logs','rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Profiles: basic identity is visible to signed-in users (needed for search and
-- line-ups) unless a block exists. Owners update their own row.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_blocked_between(id, auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy prefs_select on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy prefs_update on public.user_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy friend_requests_select on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy friendships_select on public.friendships for select to authenticated
  using (
    user_a = auth.uid() or user_b = auth.uid()
    or (public.can_view_profile_details(user_a) and public.can_view_profile_details(user_b))
  );

create policy blocks_select on public.user_blocks for select to authenticated using (blocker_id = auth.uid());

create policy invite_links_select on public.invite_links for select to authenticated using (created_by = auth.uid());

-- Groups
create policy groups_select on public.groups for select to authenticated using (public.can_view_group(id));
create policy groups_insert on public.groups for insert to authenticated with check (created_by = auth.uid());
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated using (public.group_role_of(id) = 'owner');

create policy group_settings_select on public.group_settings for select to authenticated using (public.can_view_group(group_id));
create policy group_settings_update on public.group_settings for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy group_members_select on public.group_members for select to authenticated using (public.can_view_group(group_id));

create policy join_requests_select on public.group_join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

create policy seasons_select on public.seasons for select to authenticated using (public.can_view_group(group_id));
create policy season_awards_select on public.season_awards for select to authenticated
  using (exists (select 1 from public.seasons s where s.id = season_id and public.can_view_group(s.group_id)));

-- Sessions
create policy templates_all on public.session_templates for all to authenticated
  using (owner_id = auth.uid()) with check (
    owner_id = auth.uid() and (group_id is null or public.is_group_member(group_id))
  );

create policy sessions_select on public.sessions for select to authenticated using (public.can_view_session(id));
create policy session_hosts_select on public.session_hosts for select to authenticated using (public.can_view_session(session_id));
create policy invitations_select on public.session_invitations for select to authenticated using (public.can_view_session(session_id));
create policy attendance_select on public.session_attendance for select to authenticated using (public.can_view_session(session_id));

create policy fixtures_select on public.fixtures for select to authenticated using (public.can_view_session(session_id));
create policy fixture_teams_select on public.fixture_teams for select to authenticated
  using (public.can_view_session(public.session_of_fixture(fixture_id)));
create policy team_players_select on public.team_players for select to authenticated
  using (public.can_view_session(public.session_of_fixture(fixture_id)));

-- Goal submissions: owner and managers see them; other participants see approved totals via player_goals.
create policy submissions_select on public.goal_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_session_manager(session_id) or public.is_verified_participant(session_id));
create policy goal_reviews_select on public.goal_reviews for select to authenticated
  using (exists (
    select 1 from public.goal_submissions g where g.id = submission_id
      and (g.user_id = auth.uid() or public.is_session_manager(g.session_id))
  ));
create policy player_goals_select on public.player_goals for select to authenticated using (public.can_view_session(session_id));

-- Votes and ratings are anonymous: a voter can only ever read their own ballots.
create policy ratings_select_own on public.player_ratings for select to authenticated using (rater_id = auth.uid());
create policy motm_votes_select_own on public.motm_votes for select to authenticated using (voter_id = auth.uid());
create policy motm_awards_select on public.motm_awards for select to authenticated using (public.can_view_session(session_id));

create policy sps_select on public.session_player_statistics for select to authenticated
  using (public.can_view_profile_details(user_id) or public.can_view_session(session_id));

create policy achievements_select on public.achievements for select to authenticated using (true);
create policy player_achievements_select on public.player_achievements for select to authenticated
  using (public.can_view_profile_details(user_id));

-- Social
create policy feed_select on public.activity_feed for select to authenticated using (public.can_view_activity(id));
create policy comments_select on public.comments for select to authenticated
  using (public.can_view_activity(activity_id) and not public.is_blocked_between(author_id, auth.uid()));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_activity(activity_id));
create policy reactions_select on public.reactions for select to authenticated using (public.can_view_activity(activity_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_activity(activity_id));
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());

-- Payments: payers see their own; managers see their sessions'.
create policy payment_accounts_select on public.payment_accounts for select to authenticated using (user_id = auth.uid());
create policy payments_select on public.payments for select to authenticated
  using (payer_id = auth.uid() or payee_id = auth.uid() or public.is_session_manager(session_id));
create policy refunds_select on public.refunds for select to authenticated
  using (exists (
    select 1 from public.payments p where p.id = payment_id
      and (p.payer_id = auth.uid() or p.payee_id = auth.uid() or public.is_session_manager(p.session_id))
  ));
create policy payouts_select on public.payout_records for select to authenticated using (host_id = auth.uid());
-- payment_events: service role only (no policies).

create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or (group_id is not null and public.is_group_moderator(group_id)));
create policy moderation_select on public.moderation_actions for select to authenticated
  using (group_id is not null and public.is_group_moderator(group_id));
-- audit_logs and rate_limits: no client policies (service role and definer functions only).

-- Column-level hardening: authenticated clients may only update safe columns.
revoke update on public.profiles from authenticated;
grant update (display_name, bio, position, avatar_url, onboarded) on public.profiles to authenticated;
revoke update on public.groups from authenticated;
grant update (name, description, logo_url, cover_url, visibility, join_policy, location, rules) on public.groups to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated, anon;
revoke all on public.rate_limits from authenticated, anon;
revoke all on public.payment_events from authenticated, anon;
