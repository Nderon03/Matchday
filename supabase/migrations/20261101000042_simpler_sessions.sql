-- Simpler sessions:
--  * Man of the Match is always voted once per session (no per-game MOTM for new sessions).
--  * Drop-outs close 24 hours before kick-off for everyone. After that, players message the host,
--    who can let them drop out (release_session_player) so the place goes to the waiting list.

-- 1. MOTM per session. Sessions already using per-game MOTM keep it (votes may be under way).
create or replace function public.sessions_simple_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.motm_mode = 'session' then
    new.motm_mode := 'session';
  end if;
  new.rsvp_deadline := new.starts_at - interval '24 hours';
  return new;
end $$;

drop trigger if exists sessions_simple_defaults on public.sessions;
create trigger sessions_simple_defaults
  before insert or update of starts_at, rsvp_deadline, motm_mode on public.sessions
  for each row execute function public.sessions_simple_defaults();

update public.sessions set motm_mode = 'session' where status = 'scheduled' and motm_mode = 'fixture';
update public.sessions set rsvp_deadline = starts_at - interval '24 hours' where status = 'scheduled';
update public.group_settings set default_motm_mode = 'session' where default_motm_mode <> 'session';

-- 2. Past the deadline, a confirmed player can't take themselves out by any route
--    ("can't make it", "unavailable" or "withdraw"); the host can.
create or replace function public.attendance_deadline_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_deadline timestamptz;
begin
  if old.status = 'confirmed' and new.status in ('withdrawn', 'declined', 'unavailable')
     and auth.uid() = new.user_id and not public.is_session_manager(new.session_id, auth.uid()) then
    select rsvp_deadline into v_deadline from public.sessions where id = new.session_id;
    if v_deadline is not null and now() > v_deadline then
      perform public.raise_app_error('deadline_passed', 'Drop-outs closed 24 hours before kick-off. Message the host and they can let you drop out.');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists attendance_deadline_guard on public.session_attendance;
create trigger attendance_deadline_guard
  before update of status on public.session_attendance
  for each row execute function public.attendance_deadline_guard();

-- 3. The host lets a player drop out (e.g. they messaged after the deadline). Their place goes to
--    the waiting list as normal (offers in the last 24 hours) and their guests go with them.
create or replace function public.release_session_player(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_prev public.rsvp_status;
begin
  if v.status <> 'scheduled' then perform public.raise_app_error('locked', 'This session has already started.'); end if;
  if p_user = v.host_id then perform public.raise_app_error('invalid', 'The host can’t drop out of their own session.'); end if;
  select status into v_prev from public.session_attendance where session_id = p_session and user_id = p_user for update;
  if v_prev is distinct from 'confirmed' and v_prev is distinct from 'waitlisted' then
    perform public.raise_app_error('invalid', 'That player isn’t in the squad.');
  end if;
  update public.session_attendance set status = 'withdrawn', responded_at = now(), waitlisted_at = null,
    checked_in_at = null, verification = 'unverified', offer_expires_at = null,
    late_withdrawal = late_withdrawal or (v_prev = 'confirmed' and v.starts_at - now() < interval '24 hours')
   where session_id = p_session and user_id = p_user;
  delete from public.team_players tp using public.fixtures f
   where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = p_user;
  if v_prev = 'confirmed' then perform public.promote_from_waitlist(p_session); end if;
  perform public.notify(p_user, 'session_released', 'You’re out of ' || v.name,
    'The host let you drop out. You can join again if there’s space.',
    jsonb_build_object('session_id', p_session, 'session_name', v.name));
  perform public.log_audit('attendance.released', 'session', p_session, jsonb_build_object('user_id', p_user));
end $$;

revoke execute on function public.release_session_player(uuid, uuid) from public, anon;
grant execute on function public.release_session_player(uuid, uuid) to authenticated;
