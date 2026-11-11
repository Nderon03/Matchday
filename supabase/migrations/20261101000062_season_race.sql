-- The race for Player of the Season (a live table, like a ranked ladder) and the end-of-season nudges.
--  * season_standings(): everyone's season so far, scored with the same formula finalise_season uses:
--      average rating + 1.5 × MOTM per game + 0.5 × share of the group's games played.
--  * get_season_race(group): this season's live table for a group's members.
--  * run_season_nudges(): once per season, two weeks before the end, one message per member:
--      in the top 3 → "you're 2nd in the race"; a few games short → "play 2 more to be in the running";
--      otherwise, if the group is short of the 7 games → "needs 3 more games for awards".

alter table public.seasons add column if not exists nudged_at timestamptz;

create or replace function public.season_standings(p_season uuid)
returns table (user_id uuid, apps int, rating numeric, motm int, score numeric, eligible boolean, games int, min_apps int)
language sql stable security definer set search_path = public as $$
  with g as (
    select count(*)::int games from public.sessions where season_id = p_season and status = 'finalised'
  ), agg as (
    select sps.user_id, count(*)::int apps, avg(sps.rating_avg) filter (where sps.rating_eligible) rating,
           count(*) filter (where sps.motm)::int motm, count(*) filter (where sps.rating_eligible) rated
      from public.session_player_statistics sps
      join public.sessions s on s.id = sps.session_id and s.status = 'finalised'
     where sps.season_id = p_season group by sps.user_id
  )
  select a.user_id, a.apps, round(a.rating, 2), a.motm,
         case when a.rated >= 1 and g.games > 0
              then round(a.rating + 1.5 * a.motm::numeric / a.apps + 0.5 * a.apps::numeric / g.games, 2) end,
         a.apps >= ceil(greatest(g.games, 7) * 0.5), g.games, ceil(greatest(g.games, 7) * 0.5)::int
    from agg a cross join g
$$;
revoke execute on function public.season_standings(uuid) from public, anon, authenticated;

-- the group's season for today (null until its first game is finalised)
create or replace function public.current_group_season(p_group uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.seasons where group_id = p_group and current_date between starts_on and ends_on order by starts_on desc limit 1
$$;
revoke execute on function public.current_group_season(uuid) from public, anon, authenticated;

create or replace function public.get_season_race(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); b record; v_season uuid; v_games int := 0;
begin
  if not public.is_group_member(p_group, v_uid) then perform public.raise_app_error('forbidden', 'Only members can see the season race.'); end if;
  select * into b from public.season_bounds(current_date);
  v_season := public.current_group_season(p_group);
  if v_season is not null then select count(*)::int into v_games from public.sessions where season_id = v_season and status = 'finalised'; end if;
  return jsonb_build_object(
    'season_name', b.name, 'ends_on', b.ends_on, 'games', v_games, 'needed', 7,
    'min_apps', ceil(greatest(v_games, 7) * 0.5)::int,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', r.display_name, 'avatar_url', r.avatar_url,
               'apps', r.apps, 'rating', r.rating, 'motm', r.motm, 'score', r.score, 'eligible', r.eligible,
               'rank', case when r.ranked then r.rk end)
             order by r.ranked desc, r.score desc nulls last, r.apps desc)
        from (
          select st.*, p.display_name, p.avatar_url, (st.eligible and st.score is not null) ranked,
                 rank() over (partition by (st.eligible and st.score is not null) order by st.score desc nulls last) rk
            from public.season_standings(v_season) st
            join public.profiles p on p.id = st.user_id
            join public.group_members m on m.group_id = p_group and m.user_id = st.user_id
           where v_season is not null
        ) r), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_season_race(uuid) to authenticated;

create or replace function public.run_season_nudges()
returns int language plpgsql security definer set search_path = public as $$
declare se record; m record; v_n int := 0; v_days int; v_games int; v_min int; v_left text; st record; v_rank int;
begin
  for se in select s.*, g.name gname from public.seasons s join public.groups g on g.id = s.group_id
             where s.status = 'active' and s.nudged_at is null and s.ends_on >= current_date and s.ends_on - current_date <= 14 loop
    v_days := se.ends_on - current_date;
    v_left := case when v_days >= 13 then 'two weeks' when v_days = 1 then '1 day' else v_days || ' days' end;
    select count(*)::int into v_games from public.sessions where season_id = se.id and status = 'finalised';
    v_min := ceil(greatest(v_games, 7) * 0.5)::int;
    for m in select gm.user_id from public.group_members gm where gm.group_id = se.group_id loop
      select * into st from public.season_standings(se.id) x where x.user_id = m.user_id;
      v_rank := null;
      if st.user_id is not null and st.eligible and st.score is not null and v_games >= 7 then
        select 1 + count(*) into v_rank from public.season_standings(se.id) o where o.eligible and o.score > st.score;
      end if;
      if v_rank is not null and v_rank <= 3 then
        perform public.notify(m.user_id, 'season_nudge',
          case v_rank when 1 then 'You’re top of the race' else 'You’re ' || case v_rank when 2 then '2nd' else '3rd' end || ' in the race' end,
          v_left || ' left of ' || se.name || ' in ' || se.gname || '. Keep it up for Player of the Season.',
          jsonb_build_object('group_id', se.group_id, 'season_id', se.id));
      elsif st.user_id is not null and st.apps < v_min and v_min - st.apps <= 3 then
        perform public.notify(m.user_id, 'season_nudge',
          'Play ' || (v_min - st.apps) || ' more to be in the running',
          v_left || ' left of ' || se.name || '. You need ' || v_min || ' games in ' || se.gname || ' for Player of the Season.',
          jsonb_build_object('group_id', se.group_id, 'season_id', se.id));
      elsif v_games < 7 then
        perform public.notify(m.user_id, 'season_nudge',
          se.gname || ' needs ' || (7 - v_games) || ' more ' || case when 7 - v_games = 1 then 'game' else 'games' end,
          v_left || ' left of ' || se.name || '. Awards need 7 games in a season.',
          jsonb_build_object('group_id', se.group_id, 'season_id', se.id));
      else
        continue;
      end if;
      v_n := v_n + 1;
    end loop;
    update public.seasons set nudged_at = now() where id = se.id;
  end loop;
  return v_n;
end $$;
revoke execute on function public.run_season_nudges() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('matchday-season-nudges', '23 17 * * *', 'select public.run_season_nudges()');
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end $$;
