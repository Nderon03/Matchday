-- "Need players": when a game is short, the host sends one call that invites friends of the
-- squad first, then players who've recently played near the venue (up to 40). Once every
-- 3 hours per game. People can switch these off (notification type 'players_needed').

alter table public.sessions add column if not exists players_call_at timestamptz;

-- who a call would reach, best first (friends of the squad, then nearby regulars)
create or replace function public.players_call_candidates(p_session uuid)
returns table (user_id uuid, reason text) language sql stable security definer set search_path = public as $$
  with s as (select * from public.sessions where id = p_session),
  squad as (select a.user_id from public.session_attendance a where a.session_id = p_session and a.status = 'confirmed'),
  taken as (
    select a.user_id from public.session_attendance a where a.session_id = p_session
    union select i.user_id from public.session_invitations i where i.session_id = p_session
    union select host_id from s
  ),
  friends as (
    select distinct case when f.user_a = q.user_id then f.user_b else f.user_a end as user_id
      from public.friendships f join squad q on q.user_id in (f.user_a, f.user_b)
  ),
  nearby as (
    select a.user_id, max(x.starts_at) as last_played
      from public.session_attendance a
      join public.sessions x on x.id = a.session_id
      join s on true
     where a.status = 'confirmed' and a.verification = 'verified'
       and x.starts_at > now() - interval '120 days' and x.latitude is not null and s.latitude is not null
       and 6371 * 2 * asin(sqrt(power(sin(radians(x.latitude - s.latitude) / 2), 2)
             + cos(radians(s.latitude)) * cos(radians(x.latitude)) * power(sin(radians(x.longitude - s.longitude) / 2), 2))) <= 10
     group by a.user_id
  ),
  pool as (
    select f.user_id, 'friend'::text as reason, 0 as rank, now() as last_played from friends f
    union all
    select n.user_id, 'nearby', 1, n.last_played from nearby n where n.user_id not in (select user_id from friends)
  )
  select p.user_id, p.reason
    from pool p join s on true
   where p.user_id not in (select user_id from taken where user_id is not null)
     and not public.is_blocked_between(p.user_id, s.host_id)
     and exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.onboarded)
   order by p.rank, p.last_played desc
   limit 40;
$$;
revoke execute on function public.players_call_candidates(uuid) from public, anon, authenticated;

create or replace function public.preview_players_call(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  return jsonb_build_object(
    'places_left', greatest(0, v.max_attendance - public.confirmed_count(p_session)),
    'friends', (select count(*) from public.players_call_candidates(p_session) c where c.reason = 'friend'),
    'nearby', (select count(*) from public.players_call_candidates(p_session) c where c.reason = 'nearby'),
    'last_call_at', v.players_call_at,
    'next_call_at', case when v.players_call_at > now() - interval '3 hours' then v.players_call_at + interval '3 hours' end);
end $$;
grant execute on function public.preview_players_call(uuid) to authenticated;

create or replace function public.call_for_players(p_session uuid, p_message text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v public.sessions := public.require_session_manager(p_session);
  v_left int := greatest(0, v.max_attendance - public.confirmed_count(p_session));
  v_sent int := 0;
  v_when text := to_char(v.starts_at at time zone 'Europe/London', 'Dy DD Mon, HH24:MI');
  v_price text := case when v.payment_mode = 'free' or v.price_pence = 0 then 'free' else '£' || to_char(v.price_pence / 100.0, 'FM990.00') end;
  c record;
begin
  if v.status <> 'scheduled' or v.starts_at < now() then perform public.raise_app_error('locked', 'This game has already started.'); end if;
  if v_left = 0 then perform public.raise_app_error('full', 'The game is already full.'); end if;
  if v.players_call_at > now() - interval '3 hours' then
    perform public.raise_app_error('too_soon', 'You sent a call recently. You can send another a few hours after the last one.');
  end if;
  for c in select * from public.players_call_candidates(p_session) loop
    insert into public.session_invitations (session_id, user_id, invited_by) values (p_session, c.user_id, auth.uid()) on conflict do nothing;
    perform public.notify(c.user_id, 'players_needed',
      '⚽ ' || v.name || ' needs ' || v_left || case when v_left = 1 then ' player' else ' players' end,
      v.format_size || '-a-side · ' || v_when || coalesce(' · ' || nullif(v.venue, ''), '') || ' · ' || v_price || '. '
        || coalesce('“' || left(nullif(trim(p_message), ''), 140) || '” ', '') || 'Tap to join.',
      jsonb_build_object('session_id', p_session, 'session_name', v.name, 'reason', c.reason));
    v_sent := v_sent + 1;
  end loop;
  update public.sessions set players_call_at = now() where id = p_session;
  perform public.log_audit('session.players_call', 'session', p_session, jsonb_build_object('sent', v_sent));
  return v_sent;
end $$;
revoke execute on function public.call_for_players(uuid, text) from public, anon;
grant execute on function public.call_for_players(uuid, text) to authenticated;
