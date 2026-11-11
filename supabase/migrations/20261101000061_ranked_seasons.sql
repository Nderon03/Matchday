-- Seasons run themselves, the same for everyone (like a ranked season in a game): calendar
-- quarters Winter (Jan–Mar), Spring (Apr–Jun), Summer (Jul–Sep) and Autumn (Oct–Dec).
--  * A group's games join that quarter's season automatically when they're finalised.
--  * Each season finishes by itself 3 days after it ends (time for late votes and goal claims).
--  * Awards need at least 7 games in the group that season, and a player needs at least half of
--    the group's games to be in the running for any award.
--  * Player of the Season = average rating + a bonus for Man of the Match awards per game
--    (×1.5) + a smaller one for attendance (×0.5). Ties are shared.
--  * One name: the medal is now "Player of the Season" too.

alter table public.seasons add column if not exists games int;
alter table public.seasons add column if not exists awarded boolean not null default false;

-- the quarter a day falls in, and its name
create or replace function public.season_bounds(p_day date)
returns table (starts_on date, ends_on date, name text)
language sql immutable as $$
  select q.s, (q.s + interval '3 months' - interval '1 day')::date,
         (case extract(quarter from q.s)::int when 1 then 'Winter' when 2 then 'Spring' when 3 then 'Summer' else 'Autumn' end)
           || ' ' || extract(year from q.s)::int
    from (select date_trunc('quarter', p_day)::date s) q
$$;
grant execute on function public.season_bounds(date) to authenticated;

-- the group's season for a day (made on first use)
create or replace function public.ensure_group_season(p_group uuid, p_day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; b record;
begin
  select id into v_id from public.seasons where group_id = p_group and p_day between starts_on and ends_on order by starts_on desc limit 1;
  if v_id is not null then return v_id; end if;
  select * into b from public.season_bounds(p_day);
  insert into public.seasons (group_id, name, starts_on, ends_on) values (p_group, b.name, b.starts_on, b.ends_on) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.ensure_group_season(uuid, date) from public, anon, authenticated;

-- every group game joins its season when it's finalised
create or replace function public.trg_session_season()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finalised' and new.group_id is not null and new.season_id is null then
    new.season_id := public.ensure_group_season(new.group_id, new.starts_at::date);
  end if;
  return new;
end $$;
drop trigger if exists session_season on public.sessions;
create trigger session_season before update of status on public.sessions for each row execute function public.trg_session_season();

-- this quarter's games that were finalised without a season join it now (older history is left alone)
do $$
declare r record; v_season uuid;
begin
  for r in select distinct s.group_id from public.sessions s
            where s.status = 'finalised' and s.group_id is not null and s.season_id is null
              and s.starts_at::date >= date_trunc('quarter', current_date)::date loop
    v_season := public.ensure_group_season(r.group_id, current_date);
    update public.sessions set season_id = v_season
     where group_id = r.group_id and status = 'finalised' and season_id is null and starts_at::date >= date_trunc('quarter', current_date)::date;
    update public.session_player_statistics sps set season_id = v_season from public.sessions s
     where s.id = sps.session_id and s.season_id = v_season and sps.season_id is null;
  end loop;
end $$;

-- admins no longer make seasons by hand
create or replace function public.create_season(p_group uuid, p_name text, p_starts date, p_ends date)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.raise_app_error('seasons_automatic', 'Seasons now run automatically, every three months and the same for everyone.');
  return null;
end $$;

update public.achievements set name = 'Player of the Season', description = 'Be named Player of the Season in your group.' where code = 'season_champion';

drop function if exists public.finalise_season(uuid);
create or replace function public.finalise_season(p_season uuid, p_skip_unfinished boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.seasons; v_min int; v_sessions int; v_award record; v_gname text;
begin
  select * into v_s from public.seasons where id = p_season for update;
  if v_s.id is null then perform public.raise_app_error('not_found', 'Season not found.'); end if;
  -- the daily job runs it (no user); admins can finish one early
  if auth.uid() is not null and not public.is_group_admin(v_s.group_id, auth.uid()) then
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
grant execute on function public.finalise_season(uuid, boolean) to authenticated;

-- the daily job: finish every season that ended 3+ days ago
create or replace function public.run_season_rollover()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in select id from public.seasons where status = 'active' and ends_on < current_date - 3 loop
    begin
      perform public.finalise_season(r.id, true);
      v_n := v_n + 1;
    exception when others then
      raise notice 'season % not finalised: %', r.id, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function public.run_season_rollover() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('matchday-season-rollover', '41 3 * * *', 'select public.run_season_rollover()');
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end $$;

-- for Home: the season everyone's in, my groups' progress, and seasons that just finished
create or replace function public.get_my_seasons()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); b record;
begin
  select * into b from public.season_bounds(current_date);
  return jsonb_build_object(
    'current', jsonb_build_object('name', b.name, 'starts_on', b.starts_on, 'ends_on', b.ends_on),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', g.id, 'group_name', g.name, 'games', x.games, 'my_games', x.mine,
               'needed', 7, 'my_needed', greatest(1, ceil(greatest(x.games, 7) * 0.5)::int)) order by x.games desc)
        from public.group_members m join public.groups g on g.id = m.group_id
        cross join lateral (
          select count(*)::int games,
                 count(*) filter (where exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = v_uid and a.verification = 'verified'))::int mine
            from public.sessions s where s.group_id = g.id and s.status = 'finalised' and s.starts_at::date between b.starts_on and b.ends_on
        ) x
       where m.user_id = v_uid), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('season_id', se.id, 'season_name', se.name, 'group_id', g.id, 'group_name', g.name,
               'finalised_at', se.finalised_at, 'games', se.games,
               'winners', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url, 'value', sa.value))
                                      from public.season_awards sa join public.profiles p on p.id = sa.user_id
                                     where sa.season_id = se.id and sa.award = 'player_of_season'), '[]'::jsonb)) order by se.finalised_at desc)
        from public.seasons se join public.groups g on g.id = se.group_id
        join public.group_members m on m.group_id = g.id and m.user_id = v_uid
       where se.status = 'completed' and se.finalised_at > now() - interval '14 days'), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_my_seasons() to authenticated;
