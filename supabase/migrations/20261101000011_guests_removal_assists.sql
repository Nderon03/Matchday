-- Assists validation, host self-approval, removing players and session guests.

-- ---------------------------------------------------------------------------
-- Guests (players without an account), added by a confirmed member
-- ---------------------------------------------------------------------------
create table public.session_guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  added_by uuid references public.profiles (id) on delete set null,
  -- confirmed: in the squad · pending: request awaiting host · removed: removed by host
  -- declined: request refused · withdrawn: removed by the member who added them
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'removed', 'declined', 'withdrawn')),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index session_guests_session_idx on public.session_guests (session_id, status);
create unique index session_guests_one_pending on public.session_guests (session_id, added_by) where status = 'pending';
alter table public.session_guests enable row level security;
create policy session_guests_select on public.session_guests for select to authenticated using (public.can_view_session(session_id));
revoke insert, update, delete on public.session_guests from authenticated, anon;

-- team_players can now hold a registered player OR a guest
alter table public.team_players drop constraint team_players_pkey;
alter table public.team_players add column id uuid not null default gen_random_uuid() primary key;
alter table public.team_players alter column user_id drop not null;
alter table public.team_players add column guest_id uuid references public.session_guests (id) on delete cascade;
alter table public.team_players add constraint team_player_is_user_or_guest check ((user_id is null) <> (guest_id is null));
create unique index team_players_guest_unique on public.team_players (fixture_id, guest_id) where guest_id is not null;
create unique index team_players_user_team_unique on public.team_players (fixture_team_id, user_id) where user_id is not null;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.session_guests;
  end if;
end $$;

-- Squad size counts confirmed players and confirmed guests.
create or replace function public.confirmed_count(p_session uuid)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from public.session_attendance where session_id = p_session and status = 'confirmed')::int
       + (select count(*) from public.session_guests where session_id = p_session and status = 'confirmed')::int;
$$;


create or replace function public.promote_from_waitlist(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions; v_next uuid; v_confirmed int;
begin
  select * into v from public.sessions where id = p_session;
  v_confirmed := public.confirmed_count(p_session);
  if v_confirmed >= v.max_attendance then return null; end if;
  select user_id into v_next from public.session_attendance
   where session_id = p_session and status = 'waitlisted' order by waitlisted_at limit 1 for update skip locked;
  if v_next is null then return null; end if;
  update public.session_attendance set status = 'confirmed', responded_at = now(), waitlisted_at = null
   where session_id = p_session and user_id = v_next;
  perform public.notify(v_next, 'waitlist_promoted', 'A space opened up!',
    'You''re now confirmed for ' || v.name || '. Can''t make it? Withdraw so the next player gets your place.',
    jsonb_build_object('session_id', p_session));
  return v_next;
end $$;

create or replace function public.respond_to_session(p_session uuid, p_response public.rsvp_status)
returns public.rsvp_status language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v public.sessions := public.session_or_error(p_session, true);
  v_current public.session_attendance;
  v_confirmed int;
  v_new public.rsvp_status := p_response;
  v_invited boolean;
begin
  if v.status <> 'scheduled' then perform public.raise_app_error('locked', 'This session is no longer accepting responses.'); end if;
  if p_response = 'removed' then perform public.raise_app_error('invalid', 'Invalid response.'); end if;
  v_invited := exists (select 1 from public.session_invitations where session_id = p_session and user_id = v_uid);
  select * into v_current from public.session_attendance where session_id = p_session and user_id = v_uid;
  -- removed players can only come back once the host invites them again
  if v_current.status = 'removed' and not v_invited then
    perform public.raise_app_error('removed', 'The host removed you from this session. Ask them to invite you again.');
  end if;

  if v_current.user_id is null and not v_invited and not public.is_session_manager(p_session, v_uid) then
    if not (v.visibility = 'public' or (v.visibility = 'group' and public.is_group_member(v.group_id, v_uid))) then
      perform public.raise_app_error('forbidden', 'You need an invitation to join this session.');
    end if;
  end if;
  if v.host_id is not null and public.is_blocked_between(v.host_id, v_uid) then
    perform public.raise_app_error('forbidden', 'You cannot join this session.');
  end if;

  if p_response = 'withdrawn' then
    if v_current.status is distinct from 'confirmed' and v_current.status is distinct from 'waitlisted' then
      perform public.raise_app_error('invalid', 'You are not attending this session.');
    end if;
    if v.rsvp_deadline is not null and now() > v.rsvp_deadline and v_current.status = 'confirmed' then
      perform public.raise_app_error('deadline_passed', 'The withdrawal deadline has passed. Please contact the host.');
    end if;
  end if;

  if p_response in ('confirmed', 'waitlisted') then
    if v_current.status = 'confirmed' then return 'confirmed'; end if;
    v_confirmed := public.confirmed_count(p_session);
    v_new := case when v_confirmed >= v.max_attendance then 'waitlisted' else 'confirmed' end;
    if v_current.status = 'waitlisted' and v_new = 'waitlisted' then return 'waitlisted'; end if;
  end if;

  insert into public.session_attendance (session_id, user_id, status, responded_at, waitlisted_at)
  values (p_session, v_uid, v_new, now(), case when v_new = 'waitlisted' then now() end)
  on conflict (session_id, user_id) do update set
    status = excluded.status, responded_at = now(),
    waitlisted_at = case when excluded.status = 'waitlisted' then coalesce(session_attendance.waitlisted_at, now()) else null end,
    checked_in_at = case when excluded.status = 'confirmed' then session_attendance.checked_in_at else null end,
    verification = case when excluded.status = 'confirmed' then session_attendance.verification else 'unverified' end;

  -- remove from unplayed line-ups when withdrawing
  if v_new in ('withdrawn', 'declined', 'unavailable') then
    delete from public.team_players tp using public.fixtures f
     where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = v_uid;
  end if;

  if v_current.status = 'confirmed' and v_new <> 'confirmed' then
    perform public.promote_from_waitlist(p_session);
  end if;
  if v_new = 'confirmed' and v.host_id is not null and v.host_id <> v_uid then
    perform public.notify(v.host_id, 'attendance_confirmed', 'Player confirmed',
      (select display_name from public.profiles where id = v_uid) || ' is in for ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'user_id', v_uid));
  end if;
  return v_new;
end $$;

create or replace function public.save_lineup(p_fixture uuid, p_teams jsonb, p_confirm boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid := public.session_of_fixture(p_fixture);
  v public.sessions;
  v_fixture public.fixtures;
  v_side text;
  v_team public.fixture_teams;
  v_player jsonb;
  v_order int;
  v_starters int;
begin
  if v_session is null then perform public.raise_app_error('not_found', 'Fixture not found.'); end if;
  v := public.require_session_manager(v_session);
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v.status in ('finalised', 'cancelled') then
    perform public.raise_app_error('locked', 'Line-ups are locked for this session.');
  end if;
  if v_fixture.played and v.status = 'completed' then
    perform public.raise_app_error('locked', 'This fixture has been played; line-ups are locked.');
  end if;

  delete from public.team_players where fixture_id = p_fixture;
  foreach v_side in array array['A', 'B'] loop
    select * into v_team from public.fixture_teams where fixture_id = p_fixture and side = v_side::public.team_side;
    update public.fixture_teams set
      name = coalesce(nullif(trim(p_teams -> v_side ->> 'name'), ''), name),
      colour = coalesce(nullif(p_teams -> v_side ->> 'colour', ''), colour)
     where id = v_team.id;
    v_order := 0; v_starters := 0;
    for v_player in select * from jsonb_array_elements(coalesce(p_teams -> v_side -> 'players', '[]'::jsonb)) loop
      if nullif(v_player ->> 'guest_id', '') is not null then
        if not exists (select 1 from public.session_guests where id = (v_player ->> 'guest_id')::uuid and session_id = v_session and status = 'confirmed') then
          perform public.raise_app_error('ineligible_player', 'That guest is no longer in the squad.');
        end if;
      elsif not exists (
        select 1 from public.session_attendance
         where session_id = v_session and user_id = (v_player ->> 'user_id')::uuid
           and status = 'confirmed' and verification <> 'absent'
      ) then
        perform public.raise_app_error('ineligible_player', 'Only confirmed players can be selected.');
      end if;
      if not coalesce((v_player ->> 'is_substitute')::boolean, false) then v_starters := v_starters + 1; end if;
      insert into public.team_players (fixture_team_id, fixture_id, user_id, guest_id, position, is_goalkeeper, is_substitute, sort_order)
      values (v_team.id, p_fixture, nullif(v_player ->> 'user_id', '')::uuid, nullif(v_player ->> 'guest_id', '')::uuid,
              coalesce(v_player ->> 'position', 'ANY')::public.player_position,
              coalesce((v_player ->> 'is_goalkeeper')::boolean, false),
              coalesce((v_player ->> 'is_substitute')::boolean, false), v_order);
      v_order := v_order + 1;
    end loop;
    if v_starters > v.format_size then
      perform public.raise_app_error('too_many_players', 'Each team can field at most ' || v.format_size || ' starting players.');
    end if;
  end loop;

  if p_confirm then
    update public.fixtures set lineup_confirmed_at = now() where id = p_fixture;
    if v_fixture.lineup_confirmed_at is null and v.status = 'scheduled' then
      perform public.notify(tp.user_id, 'lineup_announced', 'Line-ups are in',
        'Teams for ' || v.name || case when v.mode = 'multi' then ' (game ' || v_fixture.number || ')' else '' end || ' have been announced.',
        jsonb_build_object('session_id', v_session, 'fixture_id', p_fixture))
      from public.team_players tp where tp.fixture_id = p_fixture and tp.user_id <> auth.uid();
    end if;
  end if;
  perform public.log_audit('lineup.saved', 'fixture', p_fixture, p_teams);
end $$;

create or replace function public.add_fixture(p_session uuid, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_num int; v_id uuid;
begin
  if v.status not in ('scheduled', 'in_progress') then perform public.raise_app_error('locked', 'Fixtures can no longer be added.'); end if;
  select coalesce(max(number), 0) + 1 into v_num from public.fixtures where session_id = p_session;
  v_id := public.create_fixture_row(p_session, v_num);
  update public.sessions set mode = 'multi' where id = p_session;
  if p_copy_from is not null then
    if public.session_of_fixture(p_copy_from) <> p_session then
      perform public.raise_app_error('invalid', 'You can only copy line-ups from the same session.');
    end if;
    update public.fixture_teams nt set name = ot.name, colour = ot.colour
      from public.fixture_teams ot where ot.fixture_id = p_copy_from and nt.fixture_id = v_id and nt.side = ot.side;
    insert into public.team_players (fixture_team_id, fixture_id, user_id, position, is_goalkeeper, is_substitute, sort_order)
    select nt.id, v_id, tp.user_id, tp.position, tp.is_goalkeeper, tp.is_substitute, tp.sort_order
      from public.team_players tp
      join public.fixture_teams ot on ot.id = tp.fixture_team_id
      join public.fixture_teams nt on nt.fixture_id = v_id and nt.side = ot.side
      join public.session_attendance a on a.session_id = p_session and a.user_id = tp.user_id
     where tp.fixture_id = p_copy_from and a.status = 'confirmed' and a.verification <> 'absent';
    insert into public.team_players (fixture_team_id, fixture_id, guest_id, position, is_goalkeeper, is_substitute, sort_order)
    select nt.id, v_id, tp.guest_id, tp.position, tp.is_goalkeeper, tp.is_substitute, tp.sort_order
      from public.team_players tp
      join public.fixture_teams ot on ot.id = tp.fixture_team_id
      join public.fixture_teams nt on nt.fixture_id = v_id and nt.side = ot.side
      join public.session_guests g on g.id = tp.guest_id and g.status = 'confirmed'
     where tp.fixture_id = p_copy_from;
  end if;
  perform public.log_audit('fixture.added', 'session', p_session, jsonb_build_object('fixture_id', v_id, 'copied_from', p_copy_from));
  return v_id;
end $$;

create or replace function public.accept_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.invite_links; v_result text;
begin
  select * into v from public.invite_links where code = p_code for update;
  if v.code is null or (v.expires_at is not null and v.expires_at < now()) or (v.max_uses is not null and v.uses >= v.max_uses) then
    perform public.raise_app_error('invite_expired', 'This invitation has expired or is no longer valid.');
  end if;
  if v.kind = 'friend' then
    if v.target_id = v_uid then return jsonb_build_object('kind', 'friend', 'result', 'self'); end if;
    if public.is_blocked_between(v_uid, v.target_id) then perform public.raise_app_error('blocked', 'This invite is not available.'); end if;
    insert into public.friendships (user_a, user_b) values (least(v_uid, v.target_id), greatest(v_uid, v.target_id)) on conflict do nothing;
    update public.friend_requests set status = 'accepted', responded_at = now()
     where status = 'pending' and least(sender_id, receiver_id) = least(v_uid, v.target_id) and greatest(sender_id, receiver_id) = greatest(v_uid, v.target_id);
    perform public.notify(v.target_id, 'friend_accepted', 'New friend', (select display_name from public.profiles where id = v_uid) || ' added you via your invite link.', jsonb_build_object('user_id', v_uid));
    v_result := 'friends';
  elsif v.kind = 'group' then
    insert into public.group_members (group_id, user_id) values (v.target_id, v_uid) on conflict do nothing;
    v_result := 'joined';
  else
    if exists (select 1 from public.session_attendance where session_id = v.target_id and user_id = v_uid and status = 'removed') then
      perform public.raise_app_error('removed', 'The host removed you from this session. Ask them to invite you again.');
    end if;
    insert into public.session_invitations (session_id, user_id, invited_by) values (v.target_id, v_uid, v.created_by) on conflict do nothing;
    v_result := 'invited';
  end if;
  update public.invite_links set uses = uses + 1 where code = p_code;
  return jsonb_build_object('kind', v.kind, 'target_id', v.target_id, 'result', v_result);
end $$;

drop function if exists public.validate_goal_claim(uuid, uuid, int, jsonb);

-- A player's goals + assists can never exceed the goals their team scored,
-- per game (when broken down) and across the session.
create or replace function public.validate_goal_claim(p_session uuid, p_user uuid, p_goals int, p_assists int, p_breakdown jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_max int; v_sum_g int := 0; v_sum_a int := 0; v_g int; v_a int;
begin
  if coalesce(p_goals, 0) < 0 or coalesce(p_assists, 0) < 0 then
    perform public.raise_app_error('invalid', 'Goals and assists cannot be negative.');
  end if;
  if p_breakdown is not null and jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0 then
    for v_item in select * from jsonb_array_elements(p_breakdown) loop
      v_g := coalesce((v_item ->> 'goals')::int, 0);
      v_a := coalesce((v_item ->> 'assists')::int, 0);
      select ft.score into v_max
        from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
       where tp.fixture_id = (v_item ->> 'fixture_id')::uuid and tp.user_id = p_user and f.session_id = p_session;
      if not found then
        perform public.raise_app_error('invalid_breakdown', 'You did not play in one of the selected games.');
      end if;
      if v_max is not null and v_g > v_max then
        perform public.raise_app_error('impossible_goals', 'You claimed more goals in a game than your team scored.');
      end if;
      if v_max is not null and v_g + v_a > v_max then
        perform public.raise_app_error('impossible_assists', 'Goals plus assists in a game can''t be more than your team scored (' || v_max || ').');
      end if;
      v_sum_g := v_sum_g + v_g;
      v_sum_a := v_sum_a + v_a;
    end loop;
    if v_sum_g <> p_goals then
      perform public.raise_app_error('invalid_breakdown', 'Your game-by-game goals must add up to your total.');
    end if;
    if v_sum_a <> coalesce(p_assists, 0) and v_sum_a > 0 then
      perform public.raise_app_error('invalid_breakdown', 'Your game-by-game assists must add up to your total.');
    end if;
  end if;
  select coalesce(sum(ft.score), 0) into v_max
    from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
   where f.session_id = p_session and tp.user_id = p_user and f.played;
  if p_goals > v_max then
    perform public.raise_app_error('impossible_goals', 'You claimed more goals than your teams scored (' || v_max || ').');
  end if;
  if p_goals + coalesce(p_assists, 0) > v_max then
    perform public.raise_app_error('impossible_assists', 'Goals plus assists can''t be more than your teams scored (' || v_max || ').');
  end if;
end $$;
revoke execute on function public.validate_goal_claim(uuid, uuid, int, int, jsonb) from public, anon, authenticated;

create or replace function public.submit_goals(
  p_session uuid, p_goals int, p_assists int default 0, p_breakdown jsonb default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v public.sessions := public.session_or_error(p_session);
  v_existing public.goal_submissions;
  v_id uuid;
  v_late boolean := false;
  v_track_assists boolean := coalesce((select track_assists from public.group_settings where group_id = v.group_id), true);
  v_mgr record;
begin
  perform public.check_rate_limit('submit_goals', 30, interval '1 hour');
  if not public.is_verified_participant(p_session, v_uid)
     and not (v.status = 'in_progress' and exists (
       select 1 from public.team_players tp join public.fixtures f on f.id = tp.fixture_id where f.session_id = p_session and tp.user_id = v_uid)) then
    perform public.raise_app_error('not_participant', 'Only players who took part can submit goals.');
  end if;
  if v.status not in ('in_progress', 'completed', 'finalised') then
    perform public.raise_app_error('locked', 'Goals can be submitted once the match has been played.');
  end if;
  if v.status = 'finalised' then
    -- late claims are allowed for 14 days, or until the group's next session kicks off
    if now() > v.finalised_at + interval '14 days' or exists (
      select 1 from public.sessions n where n.group_id = v.group_id and v.group_id is not null and n.starts_at > v.starts_at
        and n.starts_at < now() and n.status <> 'cancelled') then
      perform public.raise_app_error('locked', 'The window for late goal submissions has closed.');
    end if;
    v_late := true;
  end if;
  if not v_track_assists then p_assists := 0; end if;
  perform public.validate_goal_claim(p_session, v_uid, p_goals, coalesce(p_assists, 0), p_breakdown);

  select * into v_existing from public.goal_submissions where session_id = p_session and user_id = v_uid for update;
  if v_existing.id is not null and v_existing.status not in ('pending', 'clarification_requested') then
    perform public.raise_app_error('already_submitted', 'Your goals for this session have already been reviewed.');
  end if;

  insert into public.goal_submissions (session_id, user_id, goals, assists, fixture_breakdown, note, is_late, status)
  values (p_session, v_uid, p_goals, coalesce(p_assists, 0), p_breakdown, p_note, v_late, 'pending')
  on conflict (session_id, user_id) do update set goals = excluded.goals, assists = excluded.assists,
    fixture_breakdown = excluded.fixture_breakdown, note = excluded.note, status = 'pending', submitted_at = now()
  returning id into v_id;

  -- Hosts' (and co-hosts') own claims are approved automatically. They are still
  -- capped by the score, written to the review trail and to the audit log.
  if public.is_session_manager(p_session, v_uid) then
    update public.goal_submissions set status = 'approved', approved_goals = goals, approved_assists = assists where id = v_id;
    insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
    values (v_id, v_uid, 'approved', p_goals, coalesce(p_assists, 0), 'Auto-approved: submitted by the host');
    perform public.apply_approved_goals(v_id);
    if v.status = 'finalised' then
      perform public.compute_session_statistics(p_session);
      perform public.award_achievements(v_uid, p_session);
    end if;
    perform public.log_audit('goals.host_self_approved', 'goal_submission', v_id, jsonb_build_object('goals', p_goals, 'assists', p_assists));
    return v_id;
  end if;

  for v_mgr in
    select distinct u from (
      select v.host_id u union select user_id from public.session_hosts where session_id = p_session
    ) x where u is not null and u <> v_uid
  loop
    perform public.notify(v_mgr.u, 'goals_awaiting_approval', 'Goals awaiting approval',
      (select display_name from public.profiles where id = v_uid) || ' claimed ' || p_goals || ' goal' || case when p_goals = 1 then '' else 's' end || ' in ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'submission_id', v_id));
  end loop;
  perform public.log_audit('goals.submitted', 'goal_submission', v_id, jsonb_build_object('goals', p_goals, 'assists', p_assists, 'late', v_late));
  return v_id;
end $$;

create or replace function public.apply_approved_goals(p_submission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.goal_submissions; v_item jsonb; v_total_scored int; v_total_claimed int; v_total_assists int;
begin
  select * into g from public.goal_submissions where id = p_submission;
  delete from public.player_goals where submission_id = p_submission;
  if g.status in ('approved', 'corrected') then
    if g.status = 'approved' and g.fixture_breakdown is not null and jsonb_typeof(g.fixture_breakdown) = 'array' and jsonb_array_length(g.fixture_breakdown) > 0 then
      for v_item in select * from jsonb_array_elements(g.fixture_breakdown) loop
        insert into public.player_goals (session_id, fixture_id, user_id, goals, assists, submission_id)
        values (g.session_id, (v_item ->> 'fixture_id')::uuid, g.user_id, coalesce((v_item ->> 'goals')::int, 0), coalesce((v_item ->> 'assists')::int, 0), g.id);
      end loop;
    else
      insert into public.player_goals (session_id, user_id, goals, assists, submission_id)
      values (g.session_id, g.user_id, g.approved_goals, g.approved_assists, g.id);
    end if;
    -- session-wide sanity check: approved goals cannot exceed goals scored
    select coalesce(sum(ft.score), 0) into v_total_scored from public.fixture_teams ft join public.fixtures f on f.id = ft.fixture_id where f.session_id = g.session_id;
    select coalesce(sum(goals), 0), coalesce(sum(assists), 0) into v_total_claimed, v_total_assists from public.player_goals where session_id = g.session_id;
    if v_total_assists > v_total_scored then
      perform public.raise_app_error('impossible_assists', 'Approving this would credit more assists (' || v_total_assists || ') than goals were scored in the session (' || v_total_scored || ').');
    end if;
    if v_total_claimed > v_total_scored then
      perform public.raise_app_error('impossible_goals', 'Approving this would credit more goals (' || v_total_claimed || ') than were scored in the session (' || v_total_scored || ').');
    end if;
  end if;
end $$;

create or replace function public.review_goal_submission(
  p_submission uuid, p_action public.submission_status, p_goals int default null, p_assists int default null, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); g public.goal_submissions; v public.sessions;
begin
  select * into g from public.goal_submissions where id = p_submission for update;
  if g.id is null then perform public.raise_app_error('not_found', 'Submission not found.'); end if;
  if g.user_id = v_uid then perform public.raise_app_error('forbidden', 'You cannot approve your own goals.'); end if;
  if not public.can_review_submission(p_submission, v_uid) then
    perform public.raise_app_error('forbidden', 'Only the host can review goal submissions.');
  end if;
  select * into v from public.sessions where id = g.session_id;
  if p_action = 'pending' then perform public.raise_app_error('invalid', 'Choose approve, reject, correct or ask for clarification.'); end if;
  if p_action in ('corrected', 'rejected', 'clarification_requested') and coalesce(trim(p_reason), '') = '' and p_action <> 'rejected' then
    perform public.raise_app_error('reason_required', 'Please add a short explanation.');
  end if;
  if p_action = 'corrected' then
    if p_goals is null or p_goals < 0 then perform public.raise_app_error('invalid', 'Enter the corrected number of goals.'); end if;
    perform public.validate_goal_claim(g.session_id, g.user_id, p_goals, coalesce(p_assists, g.assists), null);
  end if;

  update public.goal_submissions set
    status = p_action,
    approved_goals = case p_action when 'approved' then g.goals when 'corrected' then p_goals else null end,
    approved_assists = case p_action when 'approved' then g.assists when 'corrected' then coalesce(p_assists, g.assists) else null end
   where id = p_submission;
  insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
  values (p_submission, v_uid, p_action, case when p_action = 'corrected' then p_goals else g.goals end,
          case when p_action = 'corrected' then coalesce(p_assists, g.assists) else g.assists end, p_reason);
  perform public.apply_approved_goals(p_submission);

  -- late approvals after finalisation flow through the audited recompute path
  if v.status = 'finalised' and p_action in ('approved', 'corrected') then
    perform public.compute_session_statistics(g.session_id);
    perform public.award_achievements(g.user_id, g.session_id);
  end if;

  perform public.notify(g.user_id, 'goals_reviewed',
    case p_action when 'approved' then 'Goals approved ✅' when 'corrected' then 'Goals corrected' when 'rejected' then 'Goals not approved'
      else 'Host needs clarification' end,
    coalesce(p_reason, case p_action when 'approved' then 'Your ' || g.goals || ' goal(s) now count towards your stats.' else '' end),
    jsonb_build_object('session_id', g.session_id));
  perform public.log_audit('goals.' || p_action::text, 'goal_submission', p_submission,
    jsonb_build_object('goals', p_goals, 'assists', p_assists, 'reason', p_reason, 'original_goals', g.goals));
end $$;

create or replace function public.host_record_goals(p_session uuid, p_user uuid, p_goals int, p_assists int default 0, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_id uuid;
begin
  if p_user = auth.uid() then perform public.raise_app_error('forbidden', 'Submit your own goals for another host to approve.'); end if;
  if v.status not in ('in_progress', 'completed') then perform public.raise_app_error('locked', 'Goals can only be recorded before finalisation.'); end if;
  if not public.is_verified_participant(p_session, p_user) and v.status = 'completed' then
    perform public.raise_app_error('not_participant', 'That player is not a verified participant.');
  end if;
  perform public.validate_goal_claim(p_session, p_user, p_goals, coalesce(p_assists, 0), null);
  insert into public.goal_submissions (session_id, user_id, goals, assists, note, status, approved_goals, approved_assists)
  values (p_session, p_user, p_goals, coalesce(p_assists, 0), coalesce(p_reason, 'Recorded by host'), 'approved', p_goals, coalesce(p_assists, 0))
  on conflict (session_id, user_id) do update set goals = excluded.goals, assists = excluded.assists, status = 'approved',
    approved_goals = excluded.approved_goals, approved_assists = excluded.approved_assists, fixture_breakdown = null
  returning id into v_id;
  insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
  values (v_id, auth.uid(), 'approved', p_goals, coalesce(p_assists, 0), coalesce(p_reason, 'Recorded by host'));
  perform public.apply_approved_goals(v_id);
  perform public.log_audit('goals.host_recorded', 'goal_submission', v_id, jsonb_build_object('user_id', p_user, 'goals', p_goals));
end $$;


-- ---------------------------------------------------------------------------
-- Host removes a player. They can only rejoin after a new invitation.
-- ---------------------------------------------------------------------------
create or replace function public.remove_session_player(p_session uuid, p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_prev public.rsvp_status;
begin
  if v.status not in ('scheduled', 'in_progress') then
    perform public.raise_app_error('locked', 'Players can only be removed before the session is completed.');
  end if;
  if p_user = v.host_id then perform public.raise_app_error('invalid', 'The host cannot be removed.'); end if;
  select status into v_prev from public.session_attendance where session_id = p_session and user_id = p_user for update;
  if v_prev is null and not exists (select 1 from public.session_invitations where session_id = p_session and user_id = p_user) then
    perform public.raise_app_error('not_found', 'That player is not on this session.');
  end if;
  insert into public.session_attendance (session_id, user_id, status)
  values (p_session, p_user, 'removed')
  on conflict (session_id, user_id) do update set status = 'removed', waitlisted_at = null, checked_in_at = null,
    verification = 'unverified', responded_at = now();
  delete from public.session_invitations where session_id = p_session and user_id = p_user;
  delete from public.session_hosts where session_id = p_session and user_id = p_user;
  delete from public.team_players tp using public.fixtures f
   where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = p_user;
  if v_prev = 'confirmed' then perform public.promote_from_waitlist(p_session); end if;
  perform public.notify(p_user, 'session_removed', 'Removed from ' || v.name,
    coalesce(nullif(trim(p_reason), ''), 'The host removed you from this session.') || ' You can rejoin if the host invites you again.',
    jsonb_build_object('session_id', p_session));
  perform public.log_audit('attendance.removed', 'session', p_session, jsonb_build_object('user_id', p_user, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
create or replace function public.add_session_guest(p_session uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v public.sessions := public.session_or_error(p_session, true);
  v_manager boolean := public.is_session_manager(p_session, v_uid);
  v_id uuid;
  v_status text;
  v_me public.profiles;
begin
  perform public.check_rate_limit('add_guest', 20, interval '1 hour');
  if v.status not in ('scheduled', 'in_progress') then perform public.raise_app_error('locked', 'Guests can only be added before the match.'); end if;
  if coalesce(trim(p_name), '') = '' then perform public.raise_app_error('invalid', 'Enter your guest''s name.'); end if;
  if not v_manager and not exists (select 1 from public.session_attendance where session_id = p_session and user_id = v_uid and status = 'confirmed') then
    perform public.raise_app_error('forbidden', 'Confirm your own place before adding a guest.');
  end if;
  if not v_manager and (select count(*) from public.session_guests where session_id = p_session and added_by = v_uid and status in ('confirmed', 'pending')) >= 2 then
    perform public.raise_app_error('guest_limit', 'You can bring at most two guests.');
  end if;

  if v_manager then
    v_status := 'confirmed';
  elsif exists (select 1 from public.session_guests where session_id = p_session and added_by = v_uid and status = 'removed') then
    -- the host removed one of this player's guests: further guests need approval
    if exists (select 1 from public.session_guests where session_id = p_session and added_by = v_uid and status = 'pending') then
      perform public.raise_app_error('request_pending', 'You already have a guest request waiting for the host.');
    end if;
    v_status := 'pending';
  else
    v_status := 'confirmed';
  end if;
  if v_status = 'confirmed' and public.confirmed_count(p_session) >= v.max_attendance then
    perform public.raise_app_error('session_full', 'The session is full, so there is no space for a guest.');
  end if;

  insert into public.session_guests (session_id, name, added_by, status, decided_by, decided_at)
  values (p_session, trim(p_name), v_uid, v_status, case when v_status = 'confirmed' and v_manager then v_uid end, case when v_status = 'confirmed' then now() end)
  returning id into v_id;

  select * into v_me from public.profiles where id = v_uid;
  if v_status = 'pending' then
    perform public.notify(m, 'guest_request', 'Guest request', v_me.display_name || ' wants to bring ' || trim(p_name) || ' to ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'guest_id', v_id))
    from (select v.host_id m union select user_id from public.session_hosts where session_id = p_session) x where m is not null;
  elsif not v_manager and v.host_id is not null then
    perform public.notify(v.host_id, 'guest_added', 'Guest added', v_me.display_name || ' is bringing ' || trim(p_name) || ' to ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'guest_id', v_id));
  end if;
  perform public.log_audit('guest.' || v_status, 'session', p_session, jsonb_build_object('guest_id', v_id, 'name', trim(p_name)));
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

create or replace function public.decide_guest_request(p_guest uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g public.session_guests; v public.sessions;
begin
  select * into g from public.session_guests where id = p_guest for update;
  if g.id is null then perform public.raise_app_error('not_found', 'Guest request not found.'); end if;
  v := public.require_session_manager(g.session_id);
  if g.status <> 'pending' then perform public.raise_app_error('already_handled', 'This request has already been handled.'); end if;
  if p_approve and public.confirmed_count(g.session_id) >= v.max_attendance then
    perform public.raise_app_error('session_full', 'The session is full. Raise the maximum players first.');
  end if;
  update public.session_guests set status = case when p_approve then 'confirmed' else 'declined' end, decided_by = auth.uid(), decided_at = now()
   where id = p_guest;
  perform public.notify(g.added_by, 'guest_request_decided', case when p_approve then 'Guest approved' else 'Guest request declined' end,
    g.name || case when p_approve then ' can join you at ' else ' can''t join you at ' end || v.name || '.',
    jsonb_build_object('session_id', g.session_id));
  perform public.log_audit(case when p_approve then 'guest.approved' else 'guest.declined' end, 'session', g.session_id, jsonb_build_object('guest_id', p_guest));
end $$;

-- Host removes a guest (member must then request future guests), or the member withdraws their own.
create or replace function public.remove_session_guest(p_guest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); g public.session_guests; v public.sessions; v_by_host boolean;
begin
  select * into g from public.session_guests where id = p_guest for update;
  if g.id is null or g.status not in ('confirmed', 'pending') then perform public.raise_app_error('not_found', 'Guest not found.'); end if;
  select * into v from public.sessions where id = g.session_id;
  v_by_host := public.is_session_manager(g.session_id, v_uid);
  if not v_by_host and g.added_by is distinct from v_uid then
    perform public.raise_app_error('forbidden', 'Only the host or the player who added this guest can remove them.');
  end if;
  if v.status not in ('scheduled', 'in_progress') then perform public.raise_app_error('locked', 'Guests can only be removed before the session is completed.'); end if;
  update public.session_guests
     set status = case when v_by_host and g.added_by is distinct from v_uid then 'removed' else 'withdrawn' end, decided_by = v_uid, decided_at = now()
   where id = p_guest;
  delete from public.team_players tp using public.fixtures f where tp.fixture_id = f.id and f.played = false and tp.guest_id = p_guest;
  if g.status = 'confirmed' then perform public.promote_from_waitlist(g.session_id); end if;
  if v_by_host and g.added_by is not null and g.added_by <> v_uid then
    perform public.notify(g.added_by, 'guest_removed', 'Guest removed', 'The host removed ' || g.name || ' from ' || v.name || '. To bring another guest, send a request.',
      jsonb_build_object('session_id', g.session_id));
  end if;
  perform public.log_audit('guest.removed', 'session', g.session_id, jsonb_build_object('guest_id', p_guest, 'by_host', v_by_host));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.confirmed_count(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

