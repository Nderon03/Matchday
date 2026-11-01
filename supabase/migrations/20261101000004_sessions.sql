-- Sessions, attendance, fixtures, line-ups, results, goals and voting.
-- Every function validates the caller and runs in a single transaction.

-- Minimum number of valid ratings a player needs for a session rating to count.
-- Scales with the number of verified participants; an explicit group override wins.
create or replace function public.min_ratings_required(p_participants int, p_override int default null)
returns int language sql immutable as $$
  select case
    when p_override is not null then p_override
    when p_participants <= 2 then 1
    else least(5, greatest(2, ceil(0.4 * (p_participants - 1))::int))
  end;
$$;

create or replace function public.session_or_error(p_session uuid, p_lock boolean default false)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v public.sessions;
begin
  if p_lock then
    select * into v from public.sessions where id = p_session for update;
  else
    select * into v from public.sessions where id = p_session;
  end if;
  if v.id is null then perform public.raise_app_error('not_found', 'Session could not be found.'); end if;
  return v;
end $$;

create or replace function public.require_session_manager(p_session uuid)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session, true);
begin
  if not public.is_session_manager(p_session, public.require_user()) then
    perform public.raise_app_error('forbidden', 'Only the host can do that.');
  end if;
  return v;
end $$;

create or replace function public.create_fixture_row(p_session uuid, p_number int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.fixtures (session_id, number) values (p_session, p_number) returning id into v_id;
  insert into public.fixture_teams (fixture_id, side, name, colour) values
    (v_id, 'A', 'Team A', '#22C55E'),
    (v_id, 'B', 'Team B', '#F5F5F5');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Creating and editing sessions
-- ---------------------------------------------------------------------------
create or replace function public.create_session(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_id uuid;
  v_group uuid := nullif(p ->> 'group_id', '')::uuid;
  v_format int := coalesce((p ->> 'format_size')::int, 5);
  v_invitee uuid;
  v_host public.profiles;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_payment public.payment_mode := coalesce(p ->> 'payment_mode', 'free')::public.payment_mode;
begin
  perform public.check_rate_limit('create_session', 30, interval '1 day');
  if v_starts is null then perform public.raise_app_error('invalid', 'Choose a date and kick-off time.'); end if;
  if v_starts < now() - interval '1 day' then
    perform public.raise_app_error('invalid', 'Sessions cannot be created more than a day in the past.');
  end if;
  if v_group is not null and not public.is_group_member(v_group, v_uid) then
    perform public.raise_app_error('forbidden', 'You must be a member of the group to create a session for it.');
  end if;

  insert into public.sessions (
    group_id, host_id, template_id, name, starts_at, duration_minutes, location, venue, format_size,
    max_attendance, visibility, description, payment_mode, price_pence, mode, motm_mode, rsvp_deadline
  ) values (
    v_group, v_uid, nullif(p ->> 'template_id', '')::uuid, trim(p ->> 'name'), v_starts,
    coalesce((p ->> 'duration_minutes')::int, 60), p ->> 'location', p ->> 'venue', v_format,
    coalesce((p ->> 'max_attendance')::int, v_format * 2),
    coalesce(p ->> 'visibility', case when v_group is null then 'private' else 'group' end)::public.session_visibility,
    p ->> 'description', v_payment,
    case when v_payment = 'free' then 0 else coalesce((p ->> 'price_pence')::int, 0) end,
    coalesce(p ->> 'mode', 'single')::public.session_mode,
    coalesce(p ->> 'motm_mode', (select default_motm_mode::text from public.group_settings where group_id = v_group), 'session')::public.motm_mode,
    nullif(p ->> 'rsvp_deadline', '')::timestamptz
  ) returning id into v_id;

  -- the host is attending by default
  insert into public.session_attendance (session_id, user_id, status) values (v_id, v_uid, 'confirmed');
  perform public.create_fixture_row(v_id, 1);

  select * into v_host from public.profiles where id = v_uid;
  for v_invitee in select distinct (jsonb_array_elements_text(coalesce(p -> 'invitee_ids', '[]'::jsonb)))::uuid loop
    continue when v_invitee = v_uid;
    -- you may invite friends, or members of the session's group
    if not (public.are_friends(v_uid, v_invitee) or (v_group is not null and public.is_group_member(v_group, v_invitee))) then
      continue;
    end if;
    continue when public.is_blocked_between(v_uid, v_invitee);
    insert into public.session_invitations (session_id, user_id, invited_by) values (v_id, v_invitee, v_uid) on conflict do nothing;
    perform public.notify(v_invitee, 'session_invite', 'You''re invited: ' || trim(p ->> 'name'),
      v_host.display_name || ' invited you to play ' || v_format || '-a-side on ' || to_char(v_starts at time zone 'Europe/London', 'Dy DD Mon, HH24:MI') || '.',
      jsonb_build_object('session_id', v_id));
  end loop;

  for v_invitee in select (jsonb_array_elements_text(coalesce(p -> 'co_host_ids', '[]'::jsonb)))::uuid loop
    if public.are_friends(v_uid, v_invitee) or (v_group is not null and public.is_group_member(v_group, v_invitee)) then
      insert into public.session_hosts (session_id, user_id) values (v_id, v_invitee) on conflict do nothing;
    end if;
  end loop;

  perform public.log_audit('session.created', 'session', v_id, p - 'invitee_ids');
  return v_id;
end $$;

create or replace function public.update_session(p_session uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_changed boolean;
begin
  if v.status not in ('scheduled', 'in_progress') then
    perform public.raise_app_error('locked', 'This session can no longer be edited.');
  end if;
  if p ? 'payment_mode' and (p ->> 'payment_mode') <> v.payment_mode::text
     and exists (select 1 from public.payments where session_id = p_session and status in ('pending', 'authorised', 'paid')) then
    perform public.raise_app_error('locked', 'Payment settings cannot change once players have paid.');
  end if;
  if p ? 'max_attendance' and (p ->> 'max_attendance')::int <
     (select count(*) from public.session_attendance where session_id = p_session and status = 'confirmed') then
    perform public.raise_app_error('invalid', 'Maximum attendance cannot be lower than the number of confirmed players.');
  end if;
  v_changed := (p ? 'starts_at' and (p ->> 'starts_at')::timestamptz <> v.starts_at) or (p ? 'venue' and p ->> 'venue' is distinct from v.venue);

  update public.sessions set
    name = coalesce(trim(p ->> 'name'), name),
    starts_at = coalesce((p ->> 'starts_at')::timestamptz, starts_at),
    duration_minutes = coalesce((p ->> 'duration_minutes')::int, duration_minutes),
    location = case when p ? 'location' then p ->> 'location' else location end,
    venue = case when p ? 'venue' then p ->> 'venue' else venue end,
    format_size = coalesce((p ->> 'format_size')::int, format_size),
    max_attendance = coalesce((p ->> 'max_attendance')::int, max_attendance),
    visibility = coalesce((p ->> 'visibility')::public.session_visibility, visibility),
    description = case when p ? 'description' then p ->> 'description' else description end,
    payment_mode = coalesce((p ->> 'payment_mode')::public.payment_mode, payment_mode),
    price_pence = case when coalesce((p ->> 'payment_mode')::public.payment_mode, payment_mode) = 'free' then 0
                       else coalesce((p ->> 'price_pence')::int, price_pence) end,
    motm_mode = coalesce((p ->> 'motm_mode')::public.motm_mode, motm_mode),
    rsvp_deadline = case when p ? 'rsvp_deadline' then nullif(p ->> 'rsvp_deadline', '')::timestamptz else rsvp_deadline end
  where id = p_session;

  if v_changed then
    perform public.notify(a.user_id, 'session_updated', 'Session updated: ' || v.name, 'The kick-off time or venue has changed.',
      jsonb_build_object('session_id', p_session))
    from public.session_attendance a where a.session_id = p_session and a.status in ('confirmed', 'waitlisted') and a.user_id <> auth.uid();
  end if;
  perform public.log_audit('session.updated', 'session', p_session, p);
end $$;

create or replace function public.cancel_session(p_session uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.status in ('finalised', 'cancelled') then
    perform public.raise_app_error('locked', 'This session cannot be cancelled.');
  end if;
  update public.sessions set status = 'cancelled', cancelled_at = now() where id = p_session;
  perform public.notify(a.user_id, 'session_cancelled', v.name || ' cancelled', coalesce(p_reason, 'The host cancelled this session.') ||
      case when v.payment_mode <> 'free' then ' Any payment will be refunded or released automatically.' else '' end,
    jsonb_build_object('session_id', p_session))
  from public.session_attendance a where a.session_id = p_session and a.status in ('confirmed', 'waitlisted') and a.user_id <> auth.uid();
  perform public.log_audit('session.cancelled', 'session', p_session, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.invite_to_session(p_session uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_u uuid; v_n int := 0; v_me public.profiles;
begin
  if v.status not in ('scheduled', 'in_progress') then perform public.raise_app_error('locked', 'Invitations are closed.'); end if;
  select * into v_me from public.profiles where id = auth.uid();
  foreach v_u in array p_users loop
    continue when v_u = auth.uid() or public.is_blocked_between(auth.uid(), v_u);
    continue when not (public.are_friends(auth.uid(), v_u) or (v.group_id is not null and public.is_group_member(v.group_id, v_u)));
    insert into public.session_invitations (session_id, user_id, invited_by) values (p_session, v_u, auth.uid()) on conflict do nothing;
    if found then
      v_n := v_n + 1;
      perform public.notify(v_u, 'session_invite', 'You''re invited: ' || v.name,
        v_me.display_name || ' invited you to ' || v.format_size || '-a-side on ' || to_char(v.starts_at at time zone 'Europe/London', 'Dy DD Mon, HH24:MI') || '.',
        jsonb_build_object('session_id', p_session));
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.add_co_host(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if not exists (select 1 from public.session_attendance where session_id = p_session and user_id = p_user)
     and not exists (select 1 from public.session_invitations where session_id = p_session and user_id = p_user) then
    perform public.raise_app_error('invalid', 'Co-hosts must be invited to the session.');
  end if;
  insert into public.session_hosts (session_id, user_id) values (p_session, p_user) on conflict do nothing;
  perform public.log_audit('session.cohost_added', 'session', p_session, jsonb_build_object('user_id', p_user));
end $$;

-- ---------------------------------------------------------------------------
-- RSVP, waiting list and check-in
-- ---------------------------------------------------------------------------
create or replace function public.promote_from_waitlist(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions; v_next uuid; v_confirmed int;
begin
  select * into v from public.sessions where id = p_session;
  select count(*) into v_confirmed from public.session_attendance where session_id = p_session and status = 'confirmed';
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
  v_invited := exists (select 1 from public.session_invitations where session_id = p_session and user_id = v_uid);
  select * into v_current from public.session_attendance where session_id = p_session and user_id = v_uid;

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
    select count(*) into v_confirmed from public.session_attendance where session_id = p_session and status = 'confirmed';
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

create or replace function public.check_in(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.sessions := public.session_or_error(p_session);
begin
  if v.status not in ('scheduled', 'in_progress') then perform public.raise_app_error('locked', 'Check-in is closed for this session.'); end if;
  if now() < v.starts_at - interval '3 hours' then
    perform public.raise_app_error('too_early', 'Check-in opens 3 hours before kick-off.');
  end if;
  update public.session_attendance set checked_in_at = coalesce(checked_in_at, now())
   where session_id = p_session and user_id = v_uid and status = 'confirmed';
  if not found then perform public.raise_app_error('invalid', 'Only confirmed players can check in.'); end if;
end $$;

-- Host has final authority over verified attendance.
create or replace function public.set_attendance_verification(
  p_session uuid, p_user uuid, p_verification public.verification_status, p_late boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.status in ('finalised', 'cancelled') then
    perform public.raise_app_error('locked', 'Use a correction to change attendance after finalisation.');
  end if;
  if p_verification = 'verified' then
    update public.session_attendance set status = 'confirmed', waitlisted_at = null where session_id = p_session and user_id = p_user;
  end if;
  update public.session_attendance
     set verification = p_verification, verified_by = auth.uid(), verified_at = now(), late_arrival = coalesce(p_late, false)
   where session_id = p_session and user_id = p_user;
  if not found then perform public.raise_app_error('not_found', 'That player is not on this session.'); end if;
  if p_verification = 'absent' then
    delete from public.team_players tp using public.fixtures f
     where tp.fixture_id = f.id and f.session_id = p_session and tp.user_id = p_user;
  end if;
  perform public.log_audit('attendance.verified', 'session', p_session,
    jsonb_build_object('user_id', p_user, 'verification', p_verification, 'late', p_late));
end $$;

-- Host adds a player directly (e.g. a replacement who turned up on the night).
create or replace function public.add_session_player(p_session uuid, p_user uuid, p_replacement_for uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.status in ('finalised', 'cancelled') then perform public.raise_app_error('locked', 'This session is locked.'); end if;
  if not (public.are_friends(auth.uid(), p_user) or (v.group_id is not null and public.is_group_member(v.group_id, p_user))
          or exists (select 1 from public.session_invitations where session_id = p_session and user_id = p_user)
          or exists (select 1 from public.session_attendance where session_id = p_session and user_id = p_user)) then
    perform public.raise_app_error('forbidden', 'You can only add friends or group members.');
  end if;
  insert into public.session_invitations (session_id, user_id, invited_by) values (p_session, p_user, auth.uid()) on conflict do nothing;
  insert into public.session_attendance (session_id, user_id, status, replacement_for)
  values (p_session, p_user, 'confirmed', p_replacement_for)
  on conflict (session_id, user_id) do update set status = 'confirmed', waitlisted_at = null, replacement_for = excluded.replacement_for;

  if p_replacement_for is not null then
    update public.session_attendance set verification = 'absent', verified_by = auth.uid(), verified_at = now()
     where session_id = p_session and user_id = p_replacement_for;
    -- swap the replacement into unplayed line-ups
    update public.team_players tp set user_id = p_user
      from public.fixtures f
     where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = p_replacement_for
       and not exists (select 1 from public.team_players x where x.fixture_id = f.id and x.user_id = p_user);
    delete from public.team_players tp using public.fixtures f
     where tp.fixture_id = f.id and f.session_id = p_session and tp.user_id = p_replacement_for;
  end if;
  perform public.notify(p_user, 'attendance_confirmed', 'You''ve been added to ' || v.name, 'The host added you to the squad.',
    jsonb_build_object('session_id', p_session));
  perform public.log_audit('attendance.player_added', 'session', p_session,
    jsonb_build_object('user_id', p_user, 'replacement_for', p_replacement_for));
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures & line-ups
-- ---------------------------------------------------------------------------
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
  end if;
  perform public.log_audit('fixture.added', 'session', p_session, jsonb_build_object('fixture_id', v_id, 'copied_from', p_copy_from));
  return v_id;
end $$;

create or replace function public.delete_fixture(p_fixture uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_session uuid := public.session_of_fixture(p_fixture); v public.sessions; v_number int; v_f record;
begin
  v := public.require_session_manager(v_session);
  if v.status in ('completed', 'finalised', 'cancelled') then perform public.raise_app_error('locked', 'Fixtures are locked.'); end if;
  if (select count(*) from public.fixtures where session_id = v_session) <= 1 then
    perform public.raise_app_error('invalid', 'A session needs at least one fixture.');
  end if;
  select number into v_number from public.fixtures where id = p_fixture;
  delete from public.fixtures where id = p_fixture;
  -- close the gap one fixture at a time (ascending) so (session_id, number) stays unique
  for v_f in select id from public.fixtures where session_id = v_session and number > v_number order by number loop
    update public.fixtures set number = number - 1 where id = v_f.id;
  end loop;
  if (select count(*) from public.fixtures where session_id = v_session) = 1 then
    update public.sessions set mode = 'single' where id = v_session;
  end if;
  perform public.log_audit('fixture.deleted', 'session', v_session, jsonb_build_object('fixture_id', p_fixture));
end $$;

-- p_teams: {"A": {"name": "...", "colour": "#...", "players": [{"user_id": "...", "position": "GK", "is_goalkeeper": true, "is_substitute": false}]}, "B": {...}}
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
      if not exists (
        select 1 from public.session_attendance
         where session_id = v_session and user_id = (v_player ->> 'user_id')::uuid
           and status = 'confirmed' and verification <> 'absent'
      ) then
        perform public.raise_app_error('ineligible_player', 'Only confirmed players can be selected.');
      end if;
      if not coalesce((v_player ->> 'is_substitute')::boolean, false) then v_starters := v_starters + 1; end if;
      insert into public.team_players (fixture_team_id, fixture_id, user_id, position, is_goalkeeper, is_substitute, sort_order)
      values (v_team.id, p_fixture, (v_player ->> 'user_id')::uuid,
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

create or replace function public.record_fixture_score(p_fixture uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare v_session uuid := public.session_of_fixture(p_fixture); v public.sessions;
begin
  if v_session is null then perform public.raise_app_error('not_found', 'Fixture not found.'); end if;
  v := public.require_session_manager(v_session);
  if v.status in ('completed', 'finalised', 'cancelled') then
    perform public.raise_app_error('locked', 'Scores are locked. Use a correction instead.');
  end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 or p_score_a > 99 or p_score_b > 99 then
    perform public.raise_app_error('invalid', 'Enter a valid score.');
  end if;
  if (select count(distinct ft.side) from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id where tp.fixture_id = p_fixture) < 2 then
    perform public.raise_app_error('lineup_required', 'Pick both teams before recording the score.');
  end if;
  update public.fixture_teams set score = case side when 'A' then p_score_a else p_score_b end where fixture_id = p_fixture;
  update public.fixtures set played = true, result_recorded_by = auth.uid(), result_recorded_at = now(),
         lineup_confirmed_at = coalesce(lineup_confirmed_at, now()) where id = p_fixture;
  if v.status = 'scheduled' then update public.sessions set status = 'in_progress' where id = v_session; end if;
  perform public.log_audit('fixture.score_recorded', 'fixture', p_fixture, jsonb_build_object('a', p_score_a, 'b', p_score_b));
end $$;

create or replace function public.start_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.status <> 'scheduled' then return; end if;
  update public.sessions set status = 'in_progress' where id = p_session;
  perform public.log_audit('session.started', 'session', p_session);
end $$;

-- Host ends play: locks scores, settles attendance and opens goals + voting.
create or replace function public.complete_session(p_session uuid, p_voting_hours int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.sessions := public.require_session_manager(p_session);
  v_hours int;
  v_unplayed int;
begin
  if v.status not in ('scheduled', 'in_progress') then
    perform public.raise_app_error('locked', 'This session has already been completed.');
  end if;
  select number into v_unplayed from public.fixtures where session_id = p_session and played = false order by number limit 1;
  if v_unplayed is not null then
    perform public.raise_app_error('fixture_unplayed', 'Game ' || v_unplayed || ' has no score yet. Record it or remove it.');
  end if;

  -- players in a line-up are verified unless the host marked them absent;
  -- confirmed players who never appeared in a line-up are marked absent.
  update public.session_attendance a set verification = 'verified', verified_by = coalesce(a.verified_by, auth.uid()), verified_at = coalesce(a.verified_at, now())
   where a.session_id = p_session and a.status = 'confirmed' and a.verification = 'unverified'
     and exists (select 1 from public.team_players tp join public.fixtures f on f.id = tp.fixture_id where f.session_id = p_session and tp.user_id = a.user_id);
  update public.session_attendance a set verification = 'absent', verified_by = auth.uid(), verified_at = now()
   where a.session_id = p_session and a.verification = 'unverified' and a.status = 'confirmed';

  v_hours := coalesce(p_voting_hours, (select voting_window_hours from public.group_settings where group_id = v.group_id), 48);
  update public.sessions set status = 'completed', completed_at = now(), voting_closes_at = now() + make_interval(hours => v_hours)
   where id = p_session;

  perform public.notify(a.user_id, 'voting_open', 'Full time! Vote for Man of the Match',
    'Rate your teammates and pick the MOTM for ' || v.name || '.', jsonb_build_object('session_id', p_session))
  from public.session_attendance a where a.session_id = p_session and a.verification = 'verified';
  perform public.notify(a.user_id, 'goals_submit', 'Did you score?', 'Submit your goals for ' || v.name || ' — it only takes a second.',
    jsonb_build_object('session_id', p_session))
  from public.session_attendance a where a.session_id = p_session and a.verification = 'verified';

  if v.payment_mode = 'after' and v.price_pence > 0 then
    insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status)
    select p_session, a.user_id, v.host_id, v.price_pence, 'after', 'unpaid'
      from public.session_attendance a
     where a.session_id = p_session and a.verification = 'verified' and a.user_id is distinct from v.host_id
    on conflict (session_id, payer_id) do nothing;
    perform public.notify(a.user_id, 'payment_required', 'Payment due: ' || v.name,
      'Your share is £' || to_char(v.price_pence / 100.0, 'FM990.00') || '. Tap to pay.', jsonb_build_object('session_id', p_session))
    from public.session_attendance a where a.session_id = p_session and a.verification = 'verified' and a.user_id is distinct from v.host_id;
  end if;
  perform public.log_audit('session.completed', 'session', p_session, jsonb_build_object('voting_hours', v_hours));
end $$;

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
-- Integrity check: claimed goals must be possible given the recorded scores.
create or replace function public.validate_goal_claim(p_session uuid, p_user uuid, p_goals int, p_breakdown jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_max int; v_sum int := 0;
begin
  if p_breakdown is not null and jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0 then
    for v_item in select * from jsonb_array_elements(p_breakdown) loop
      select ft.score into v_max
        from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
       where tp.fixture_id = (v_item ->> 'fixture_id')::uuid and tp.user_id = p_user and f.session_id = p_session;
      if not found then
        perform public.raise_app_error('invalid_breakdown', 'You did not play in one of the selected games.');
      end if;
      if v_max is not null and coalesce((v_item ->> 'goals')::int, 0) > v_max then
        perform public.raise_app_error('impossible_goals', 'You claimed more goals in a game than your team scored.');
      end if;
      v_sum := v_sum + coalesce((v_item ->> 'goals')::int, 0);
    end loop;
    if v_sum <> p_goals then
      perform public.raise_app_error('invalid_breakdown', 'Your game-by-game goals must add up to your total.');
    end if;
  end if;
  select coalesce(sum(ft.score), 0) into v_max
    from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
   where f.session_id = p_session and tp.user_id = p_user and f.played;
  if p_goals > v_max then
    perform public.raise_app_error('impossible_goals', 'You claimed more goals than your teams scored (' || v_max || ').');
  end if;
end $$;

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
  perform public.validate_goal_claim(p_session, v_uid, p_goals, p_breakdown);

  select * into v_existing from public.goal_submissions where session_id = p_session and user_id = v_uid for update;
  if v_existing.id is not null and v_existing.status not in ('pending', 'clarification_requested') then
    perform public.raise_app_error('already_submitted', 'Your goals for this session have already been reviewed.');
  end if;

  insert into public.goal_submissions (session_id, user_id, goals, assists, fixture_breakdown, note, is_late, status)
  values (p_session, v_uid, p_goals, coalesce(p_assists, 0), p_breakdown, p_note, v_late, 'pending')
  on conflict (session_id, user_id) do update set goals = excluded.goals, assists = excluded.assists,
    fixture_breakdown = excluded.fixture_breakdown, note = excluded.note, status = 'pending', submitted_at = now()
  returning id into v_id;

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

-- Who may review a submission? Any session manager except the submitter. If the
-- submitter is the only manager, any other verified participant may confirm it.
create or replace function public.can_review_submission(p_submission uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.goal_submissions g
    where g.id = p_submission and g.user_id <> p_user
      and (
        public.is_session_manager(g.session_id, p_user)
        or (
          public.is_verified_participant(g.session_id, p_user)
          and public.is_session_manager(g.session_id, g.user_id)
          and not exists (
            select 1 from (
              select s.host_id m from public.sessions s where s.id = g.session_id
              union select h.user_id from public.session_hosts h where h.session_id = g.session_id
              union select gm.user_id from public.sessions s join public.group_members gm on gm.group_id = s.group_id and gm.role in ('owner', 'admin') where s.id = g.session_id
            ) mgrs where mgrs.m is not null and mgrs.m <> g.user_id
          )
        )
      )
  );
$$;

create or replace function public.apply_approved_goals(p_submission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.goal_submissions; v_item jsonb; v_total_scored int; v_total_claimed int;
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
    select coalesce(sum(goals), 0) into v_total_claimed from public.player_goals where session_id = g.session_id;
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
    perform public.validate_goal_claim(g.session_id, g.user_id, p_goals, null);
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

create or replace function public.bulk_approve_goals(p_session uuid, p_submissions uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in
    select id from public.goal_submissions
     where session_id = p_session and status = 'pending' and (p_submissions is null or id = any (p_submissions))
       and user_id <> auth.uid()
  loop
    perform public.review_goal_submission(v_id, 'approved');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Host enters goals on behalf of a player (e.g. someone without the app to hand).
create or replace function public.host_record_goals(p_session uuid, p_user uuid, p_goals int, p_assists int default 0, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_id uuid;
begin
  if p_user = auth.uid() then perform public.raise_app_error('forbidden', 'Submit your own goals for another host to approve.'); end if;
  if v.status not in ('in_progress', 'completed') then perform public.raise_app_error('locked', 'Goals can only be recorded before finalisation.'); end if;
  if not public.is_verified_participant(p_session, p_user) and v.status = 'completed' then
    perform public.raise_app_error('not_participant', 'That player is not a verified participant.');
  end if;
  perform public.validate_goal_claim(p_session, p_user, p_goals, null);
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
-- Voting
-- ---------------------------------------------------------------------------
create or replace function public.assert_voting_open(p_session uuid, p_voter uuid)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session);
begin
  if v.status <> 'completed' then perform public.raise_app_error('voting_closed', 'Voting is not open for this session.'); end if;
  if v.voting_closes_at is not null and now() > v.voting_closes_at then
    perform public.raise_app_error('voting_closed', 'Voting has closed for this session.');
  end if;
  if not public.is_verified_participant(p_session, p_voter) then
    perform public.raise_app_error('not_participant', 'Only verified participants can vote.');
  end if;
  return v;
end $$;

create or replace function public.cast_motm_vote(p_session uuid, p_nominee uuid, p_fixture uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.sessions;
begin
  v := public.assert_voting_open(p_session, v_uid);
  if p_nominee = v_uid then perform public.raise_app_error('self_vote', 'You cannot vote for yourself.'); end if;
  if not public.is_verified_participant(p_session, p_nominee) then
    perform public.raise_app_error('invalid_nominee', 'You can only vote for players who took part.');
  end if;
  if p_fixture is not null then
    if v.motm_mode <> 'fixture' or public.session_of_fixture(p_fixture) <> p_session then
      perform public.raise_app_error('invalid', 'MOTM is awarded for the whole session.');
    end if;
  elsif v.motm_mode = 'fixture' then
    perform public.raise_app_error('invalid', 'Choose a game to vote for.');
  end if;
  begin
    insert into public.motm_votes (session_id, fixture_id, voter_id, nominee_id) values (p_session, p_fixture, v_uid, p_nominee);
  exception when unique_violation then
    perform public.raise_app_error('already_voted', 'You have already voted.');
  end;
  perform public.log_audit('vote.motm_submitted', 'session', p_session, jsonb_build_object('fixture_id', p_fixture));
end $$;

-- p_ratings: [{"user_id": "...", "score": 7}, ...]
create or replace function public.submit_ratings(p_session uuid, p_ratings jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.sessions; v_r jsonb; v_n int := 0; v_ratee uuid; v_score int;
begin
  v := public.assert_voting_open(p_session, v_uid);
  if jsonb_typeof(p_ratings) <> 'array' or jsonb_array_length(p_ratings) = 0 then
    perform public.raise_app_error('invalid', 'Add at least one rating.');
  end if;
  for v_r in select * from jsonb_array_elements(p_ratings) loop
    v_ratee := (v_r ->> 'user_id')::uuid;
    v_score := (v_r ->> 'score')::int;
    if v_ratee = v_uid then perform public.raise_app_error('self_vote', 'You cannot rate yourself.'); end if;
    if v_score is null or v_score < 1 or v_score > 10 then perform public.raise_app_error('invalid', 'Ratings must be between 1 and 10.'); end if;
    if not public.is_verified_participant(p_session, v_ratee) then
      perform public.raise_app_error('invalid_nominee', 'You can only rate players who took part.');
    end if;
    begin
      insert into public.player_ratings (session_id, rater_id, ratee_id, score) values (p_session, v_uid, v_ratee, v_score);
    exception when unique_violation then
      perform public.raise_app_error('already_voted', 'You have already rated this player.');
    end;
    v_n := v_n + 1;
  end loop;
  perform public.log_audit('vote.ratings_submitted', 'session', p_session, jsonb_build_object('count', v_n));
  return v_n;
end $$;

create or replace function public.get_voting_state(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.sessions := public.session_or_error(p_session);
begin
  if not public.can_view_session(p_session, v_uid) then perform public.raise_app_error('forbidden', 'Insufficient permissions.'); end if;
  return jsonb_build_object(
    'open', v.status = 'completed' and (v.voting_closes_at is null or now() <= v.voting_closes_at),
    'closes_at', v.voting_closes_at,
    'eligible', public.is_verified_participant(p_session, v_uid),
    'motm_mode', v.motm_mode,
    'motm_voted', exists (select 1 from public.motm_votes where session_id = p_session and voter_id = v_uid),
    'motm_voted_fixtures', coalesce((select jsonb_agg(fixture_id) from public.motm_votes where session_id = p_session and voter_id = v_uid and fixture_id is not null), '[]'::jsonb),
    'rated_user_ids', coalesce((select jsonb_agg(ratee_id) from public.player_ratings where session_id = p_session and rater_id = v_uid), '[]'::jsonb),
    'voters_count', (select count(distinct voter_id) from public.motm_votes where session_id = p_session),
    'participants', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) order by p.display_name), '[]'::jsonb)
        from public.session_attendance a join public.profiles p on p.id = a.user_id
       where a.session_id = p_session and a.verification = 'verified'
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Templates, duplication and recurrence
-- ---------------------------------------------------------------------------
create or replace function public.save_session_as_template(p_session uuid, p_name text, p_recurrence public.recurrence default 'weekly', p_auto boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_id uuid;
begin
  insert into public.session_templates (owner_id, group_id, name, format_size, location, venue, max_attendance, visibility, description,
    payment_mode, price_pence, recurrence, start_time, duration_minutes, invitee_ids, auto_schedule)
  select auth.uid(), v.group_id, coalesce(nullif(trim(p_name), ''), v.name), v.format_size, v.location, v.venue, v.max_attendance,
         v.visibility, v.description, v.payment_mode, v.price_pence, p_recurrence,
         (v.starts_at at time zone 'Europe/London')::time, v.duration_minutes,
         coalesce(array(select user_id from public.session_attendance where session_id = p_session and status = 'confirmed' and user_id <> auth.uid()), '{}'),
         p_auto
  returning id into v_id;
  update public.sessions set template_id = v_id where id = p_session;
  return v_id;
end $$;

create or replace function public.create_session_from_template(p_template uuid, p_date date, p_actor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.session_templates; v_actor uuid := coalesce(auth.uid(), p_actor);
begin
  select * into t from public.session_templates where id = p_template;
  if t.id is null or t.owner_id <> v_actor then perform public.raise_app_error('not_found', 'Template not found.'); end if;
  if auth.uid() is null then
    -- invoked by the scheduler: impersonate the template owner for validation
    perform set_config('request.jwt.claims', jsonb_build_object('sub', t.owner_id, 'role', 'authenticated')::text, true);
  end if;
  return public.create_session(jsonb_build_object(
    'name', t.name, 'group_id', t.group_id, 'template_id', t.id,
    'starts_at', ((p_date + t.start_time) at time zone 'Europe/London'),
    'duration_minutes', t.duration_minutes, 'location', t.location, 'venue', t.venue, 'format_size', t.format_size,
    'max_attendance', t.max_attendance, 'visibility', t.visibility, 'description', t.description,
    'payment_mode', t.payment_mode, 'price_pence', t.price_pence, 'invitee_ids', to_jsonb(t.invitee_ids)
  ));
end $$;
revoke execute on function public.create_session_from_template(uuid, date, uuid) from anon;

create or replace function public.duplicate_session(p_session uuid, p_starts_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session);
begin
  if not public.is_session_manager(p_session, public.require_user()) then
    perform public.raise_app_error('forbidden', 'Only the host can repeat this session.');
  end if;
  return public.create_session(jsonb_build_object(
    'name', v.name, 'group_id', v.group_id, 'template_id', v.template_id, 'starts_at', p_starts_at,
    'duration_minutes', v.duration_minutes, 'location', v.location, 'venue', v.venue, 'format_size', v.format_size,
    'max_attendance', v.max_attendance, 'visibility', v.visibility, 'description', v.description,
    'payment_mode', v.payment_mode, 'price_pence', v.price_pence, 'motm_mode', v.motm_mode,
    'invitee_ids', coalesce((select jsonb_agg(user_id) from (
        select user_id from public.session_invitations where session_id = p_session
        union select user_id from public.session_attendance where session_id = p_session and status = 'confirmed') x), '[]'::jsonb)
  ));
end $$;
