-- Security hardening (audit).
-- 1. Postgres lets PUBLIC (which includes signed-out "anon" API callers, using the public website key)
--    run every function by default; earlier "revoke … from anon" lines never took effect because of
--    that. Signed-out callers may now run only what the signed-out website needs; everything else
--    needs a signed-in user (or the server itself). Also for functions added later.
-- 2. finalise_season and create_session_from_template treated "no signed-in user" as the scheduler,
--    so a signed-out caller could finish any group's season, or create a game as any user. They now
--    trust only real server calls (no API request, or the service role).

create or replace function public.called_by_system()
returns boolean language sql stable set search_path = public as $$
  -- true for the database's own jobs (no API request at all) and the server's service role
  select auth.uid() is null
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'system') in ('system', 'service_role')
$$;

revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on function public.get_link_preview(text) to anon;
grant execute on function public.is_username_available(text) to anon;

create or replace function public.finalise_season(p_season uuid, p_skip_unfinished boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.seasons; v_min int; v_sessions int; v_award record; v_gname text;
begin
  select * into v_s from public.seasons where id = p_season for update;
  if v_s.id is null then perform public.raise_app_error('not_found', 'Season not found.'); end if;
  -- the daily job runs it (no user); admins can finish one early
  if not public.called_by_system() and not public.is_group_admin(v_s.group_id, auth.uid()) then
    perform public.raise_app_error('forbidden', 'Only group admins can finalise seasons.');
  end if;
  if v_s.status = 'completed' then perform public.raise_app_error('locked', 'This season has already been finalised.'); end if;
  if not p_skip_unfinished and exists (select 1 from public.sessions where season_id = p_season and status = 'completed') then
    perform public.raise_app_error('pending_sessions', 'Finalise all completed games in this season first.');
  end if;

  select count(*) into v_sessions from public.sessions where season_id = p_season and status = 'finalised';
  delete from public.season_awards where season_id = p_season;

  -- awards need at least 7 games; a player needs at least half of them
  if v_sessions >= 7 then
    v_min := ceil(v_sessions * 0.5)::int;
    with agg as (
      select user_id, count(*) apps, sum(goals) goals, sum(assists) assists, sum(wins) wins, sum(fixtures_played) fx,
             count(*) filter (where motm) motm, avg(rating_avg) filter (where rating_eligible) rating,
             count(*) filter (where rating_eligible) rated
        from public.session_player_statistics where season_id = p_season group by user_id
    ), eligible as (select * from agg where apps >= v_min), halves as (
      select user_id,
             avg(rating_avg) filter (where rn > n - n / 2) recent, avg(rating_avg) filter (where rn <= n / 2) early, max(n) n
        from (select user_id, rating_avg, row_number() over (partition by user_id order by played_at) rn, count(*) over (partition by user_id) n
                from public.session_player_statistics where season_id = p_season and rating_eligible) x group by user_id
    ), candidates as (
      select 'player_of_season' award, user_id,
             round(rating + 1.5 * motm::numeric / apps + 0.5 * apps::numeric / v_sessions, 2) value, apps
        from eligible where rated >= 1
      union all select 'golden_boot', user_id, goals, apps from eligible where goals > 0
      union all select 'most_motm', user_id, motm, apps from eligible where motm > 0
      union all select 'highest_rating', user_id, round(rating, 2), apps from eligible where rated >= 1
      union all select 'most_appearances', user_id, apps, apps from eligible
      union all select 'most_wins', user_id, wins, apps from eligible where wins > 0
      union all select 'best_win_pct', user_id, round(100.0 * wins / nullif(fx, 0), 1), apps from eligible where fx > 0
      union all select 'most_improved', h.user_id, round(h.recent - h.early, 2), e.apps from halves h join eligible e using (user_id) where h.n >= 4 and h.recent > h.early
      union all select 'most_assists', user_id, assists, apps from eligible where assists > 0
    ), winners as (
      select c.*, rank() over (partition by award order by value desc) rk from candidates c where value is not null
    )
    insert into public.season_awards (season_id, award, user_id, value, appearances)
    select p_season, award, user_id, value, apps from winners where rk = 1;
  end if;

  update public.seasons set status = 'completed', finalised_at = now(), games = v_sessions,
         awarded = exists (select 1 from public.season_awards where season_id = p_season)
   where id = p_season;
  select name into v_gname from public.groups where id = v_s.group_id;
  for v_award in select sa.user_id, sa.award from public.season_awards sa where sa.season_id = p_season loop
    perform public.notify(v_award.user_id, 'season_award',
      case when v_award.award = 'player_of_season' then 'You’re Player of the Season!' else 'Season award: ' || replace(initcap(replace(v_award.award, '_', ' ')), 'Pct', '%') end,
      'For ' || v_s.name || ' in ' || v_gname || '.', jsonb_build_object('group_id', v_s.group_id, 'season_id', p_season));
    perform public.post_activity(v_award.user_id, 'season_award', jsonb_build_object('award', v_award.award, 'season_name', v_s.name, 'group_name', v_gname), v_s.group_id);
    perform public.award_achievements(v_award.user_id, null);
  end loop;
  -- everyone in the group hears it's over
  perform public.notify(m.user_id, 'season_ended', v_s.name || ' is over',
    case when v_sessions >= 7 then 'See who’s Player of the Season in ' || v_gname || '.'
         else v_gname || ' played ' || v_sessions || ' of the 7 games needed for awards. A new season has started.' end,
    jsonb_build_object('group_id', v_s.group_id, 'season_id', p_season))
    from public.group_members m where m.group_id = v_s.group_id;
  perform public.log_audit('season.finalised', 'season', p_season, jsonb_build_object('games', v_sessions));
end $$;

create or replace function public.create_session_from_template(p_template uuid, p_date date, p_actor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.session_templates; v_actor uuid := case when public.called_by_system() then p_actor else auth.uid() end;
begin
  select * into t from public.session_templates where id = p_template;
  if t.id is null or t.owner_id <> v_actor then perform public.raise_app_error('not_found', 'Template not found.'); end if;
  if public.called_by_system() then
    -- invoked by the scheduler: impersonate the template owner for validation
    perform set_config('request.jwt.claims', jsonb_build_object('sub', t.owner_id, 'role', 'authenticated')::text, true);
  end if;
  return public.create_session(jsonb_build_object(
    'name', t.name, 'group_id', t.group_id, 'template_id', t.id,
    'starts_at', ((p_date + t.start_time) at time zone 'Europe/London'),
    'duration_minutes', t.duration_minutes, 'location', t.location, 'venue', t.venue, 'postcode', t.postcode, 'latitude', t.latitude, 'longitude', t.longitude, 'format_size', t.format_size,
    'max_attendance', t.max_attendance, 'visibility', t.visibility, 'description', t.description,
    'payment_mode', t.payment_mode, 'price_pence', t.price_pence, 'invitee_ids', to_jsonb(t.invitee_ids)
  ));
end $$;
