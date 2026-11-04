-- Last-minute places, reliability and the kick-off reminder.
--
-- A. Within 24 hours of kick-off a free place is no longer handed to the next person on the
--    waiting list automatically (they might not be able to get there). They're offered it for
--    30 minutes instead; if they don't take it, it moves down the list; if nobody's left the
--    host is told. Further out than 24 hours, the old behaviour (straight in) stays.
-- B. Reliability: turning up after saying you're in. No-shows (marked absent) and pulling out
--    of a confirmed place in the last 24 hours count against it.

alter table public.session_attendance
  add column if not exists offered_at timestamptz,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists late_withdrawal boolean not null default false;

create or replace function public.promote_from_waitlist(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions; v_next uuid; v_free int;
begin
  select * into v from public.sessions where id = p_session;
  if v.status <> 'scheduled' then return null; end if;
  v_free := v.max_attendance - public.confirmed_count(p_session)
    - (select count(*) from public.session_attendance where session_id = p_session and status = 'waitlisted' and offer_expires_at > now());
  if v_free <= 0 then return null; end if;

  if v.starts_at - now() > interval '24 hours' then
    select user_id into v_next from public.session_attendance
     where session_id = p_session and status = 'waitlisted' order by waitlisted_at limit 1 for update skip locked;
    if v_next is null then return null; end if;
    update public.session_attendance set status = 'confirmed', responded_at = now(), waitlisted_at = null, offer_expires_at = null
     where session_id = p_session and user_id = v_next;
    perform public.notify(v_next, 'waitlist_promoted', 'A space opened up!',
      'You''re now confirmed for ' || v.name || '. Can''t make it? Withdraw so the next player gets your place.',
      jsonb_build_object('session_id', p_session));
    return v_next;
  end if;

  if v.starts_at <= now() then return null; end if;
  -- last 24 hours: offer it to the next person who hasn't had an offer yet
  select user_id into v_next from public.session_attendance
   where session_id = p_session and status = 'waitlisted' and offered_at is null
   order by waitlisted_at limit 1 for update skip locked;
  if v_next is null then
    if v.host_id is not null and not exists (
      select 1 from public.notifications n where n.user_id = v.host_id and n.type = 'spot_open'
         and n.data ->> 'session_id' = p_session::text and n.created_at > now() - interval '1 hour') then
      perform public.notify(v.host_id, 'spot_open', 'A place is free for ' || v.name,
        'Someone dropped out and nobody on the waiting list took it. Share the invite link to fill it.',
        jsonb_build_object('session_id', p_session));
    end if;
    return null;
  end if;
  update public.session_attendance set offered_at = now(), offer_expires_at = least(now() + interval '30 minutes', v.starts_at)
   where session_id = p_session and user_id = v_next;
  perform public.notify(v_next, 'waitlist_offer', 'A place just opened for ' || v.name,
    'It''s yours if you tap "I''m in" in the next 30 minutes. Kick-off ' || to_char(v.starts_at at time zone 'Europe/London', 'Dy HH24:MI') || '.',
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
  v_owed int;
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
    -- settle up first: unpaid bills from earlier games in this group block joining
    if v.group_id is not null and coalesce((select require_settled from public.group_settings where group_id = v.group_id), true) then
      v_owed := public.outstanding_pence(v.group_id, v_uid, p_session);
      if v_owed > 0 then
        perform public.raise_app_error('unpaid_balance',
          'You owe £' || to_char(v_owed / 100.0, 'FM990.00') || ' from earlier games in this group. Pay it (or ask the host to mark it paid in cash) to join.');
      end if;
    end if;
    -- places offered to someone else on the waiting list are held for them until the offer runs out
    v_confirmed := public.confirmed_count(p_session) + (
      select count(*) from public.session_attendance o
       where o.session_id = p_session and o.status = 'waitlisted' and o.offer_expires_at > now() and o.user_id <> v_uid);
    v_new := case when v_confirmed >= v.max_attendance then 'waitlisted' else 'confirmed' end;
    if v_current.status = 'waitlisted' and v_new = 'waitlisted' then return 'waitlisted'; end if;
  end if;

  insert into public.session_attendance (session_id, user_id, status, responded_at, waitlisted_at)
  values (p_session, v_uid, v_new, now(), case when v_new = 'waitlisted' then now() end)
  on conflict (session_id, user_id) do update set
    status = excluded.status, responded_at = now(),
    waitlisted_at = case when excluded.status = 'waitlisted' then coalesce(session_attendance.waitlisted_at, now()) else null end,
    checked_in_at = case when excluded.status = 'confirmed' then session_attendance.checked_in_at else null end,
    verification = case when excluded.status = 'confirmed' then session_attendance.verification else 'unverified' end,
    offer_expires_at = null,
    -- pulling out of a confirmed place within 24 hours of kick-off counts against reliability
    late_withdrawal = session_attendance.late_withdrawal
      or (session_attendance.status = 'confirmed' and excluded.status in ('withdrawn', 'declined', 'unavailable') and v.starts_at - now() < interval '24 hours');

  -- remove from unplayed line-ups when withdrawing
  if v_new in ('withdrawn', 'declined', 'unavailable') then
    delete from public.team_players tp using public.fixtures f
     where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = v_uid;
  end if;

  if (v_current.status = 'confirmed' or v_current.offer_expires_at > now()) and v_new <> 'confirmed' then
    perform public.promote_from_waitlist(p_session);
  end if;
  if v_new = 'confirmed' and v.host_id is not null and v.host_id <> v_uid then
    perform public.notify(v.host_id, 'attendance_confirmed', 'Player confirmed',
      (select display_name from public.profiles where id = v_uid) || ' is in for ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'user_id', v_uid));
  end if;
  return v_new;
end $$;

-- Offers that ran out move down the list (run every 5 minutes).
create or replace function public.process_waitlist_offers()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select distinct a.session_id from public.session_attendance a join public.sessions s on s.id = a.session_id
     where a.status = 'waitlisted' and a.offer_expires_at <= now() and s.status = 'scheduled'
  loop
    update public.session_attendance set offer_expires_at = null
     where session_id = r.session_id and status = 'waitlisted' and offer_expires_at <= now();
    loop
      exit when public.promote_from_waitlist(r.session_id) is null;
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Reliability for any player (it's a trust signal, like a seller rating), once they've made 5 commitments.
create or replace function public.get_reliability(p_users uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user();
begin
  return (
    select coalesce(jsonb_object_agg(u.id, jsonb_build_object(
        'attended', x.attended, 'no_shows', x.no_shows, 'late_drops', x.late_drops,
        'pct', case when x.attended + x.no_shows + x.late_drops >= 5
                    then round(100.0 * x.attended / (x.attended + x.no_shows + x.late_drops)) end)), '{}'::jsonb)
      from unnest(p_users[1:200]) u(id)
      cross join lateral (
        select count(*) filter (where a.status = 'confirmed' and a.verification = 'verified')::int as attended,
               count(*) filter (where a.status = 'confirmed' and a.verification = 'absent')::int as no_shows,
               count(*) filter (where a.late_withdrawal)::int as late_drops
          from public.session_attendance a join public.sessions s on s.id = a.session_id
         where a.user_id = u.id and (s.status in ('completed', 'finalised') or a.late_withdrawal) and s.status <> 'cancelled'
      ) x
     where not public.is_blocked_between(u.id, v_viewer)
  );
end $$;
grant execute on function public.get_reliability(uuid[]) to authenticated;

revoke execute on function public.promote_from_waitlist(uuid) from public, anon, authenticated;
revoke execute on function public.process_waitlist_offers() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('matchday-waitlist-offers', '*/5 * * * *', 'select public.process_waitlist_offers()');
  end if;
exception when others then
  raise notice 'Could not schedule waitlist offers: %', sqlerrm;
end $$;
