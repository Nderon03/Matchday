-- "Your week" recap, Sunday evening: for each player who played in the last 7 days or has a game in
-- the next 7, one notification with their results, rating trend, goals, best link-up and next game.
-- Players with nothing either way get nothing. Can be switched off like any other notification type.

create or replace function public.weekly_recap_for(p_user uuid, p_now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_games int; v_w int; v_d int; v_l int; v_goals int; v_assists int; v_motm int;
  v_rating numeric; v_prev numeric;
  v_next record; v_best record;
  v_parts text[] := '{}';
  v_title text;
  v_body text;
begin
  select count(*)::int, coalesce(sum(wins), 0)::int, coalesce(sum(draws), 0)::int, coalesce(sum(losses), 0)::int,
         coalesce(sum(goals), 0)::int, coalesce(sum(assists), 0)::int, count(*) filter (where motm)::int,
         round(avg(rating_avg) filter (where rating_eligible), 1)
    into v_games, v_w, v_d, v_l, v_goals, v_assists, v_motm, v_rating
    from public.session_player_statistics
   where user_id = p_user and played_at > p_now - interval '7 days' and played_at <= p_now;

  select s.name, s.starts_at into v_next
    from public.session_attendance a join public.sessions s on s.id = a.session_id
   where a.user_id = p_user and a.status = 'confirmed' and s.status = 'scheduled'
     and s.starts_at > p_now and s.starts_at <= p_now + interval '7 days'
   order by s.starts_at
   limit 1;

  if v_games = 0 and v_next.name is null then return null; end if;

  if v_games > 0 then
    v_title := 'Your week: ' || v_games || case when v_games = 1 then ' game' else ' games' end;
    if v_w + v_d + v_l > 0 then v_title := v_title || ', ' || v_w || 'W ' || v_d || 'D ' || v_l || 'L'; end if;

    if v_rating is not null then
      select round(avg(x.rating_avg), 1) into v_prev from (
        select rating_avg from public.session_player_statistics
         where user_id = p_user and rating_eligible and played_at <= p_now - interval '7 days'
         order by played_at desc limit 5) x;
      v_parts := v_parts || ('Rating ' || to_char(v_rating, 'FM990.0') || case
        when v_prev is null or v_prev = v_rating then ''
        when v_rating > v_prev then ' (up from ' || to_char(v_prev, 'FM990.0') || ')'
        else ' (down from ' || to_char(v_prev, 'FM990.0') || ')' end);
    end if;
    if v_goals + v_assists > 0 then
      v_parts := v_parts || concat_ws(', ',
        case when v_goals > 0 then v_goals || case when v_goals = 1 then ' goal' else ' goals' end end,
        case when v_assists > 0 then v_assists || case when v_assists = 1 then ' assist' else ' assists' end end);
    end if;
    if v_motm > 0 then v_parts := v_parts || (case when v_motm = 1 then 'Man of the Match' else v_motm || '× Man of the Match' end); end if;
  else
    v_title := 'Your week ahead';
  end if;

  -- best link-up, all games: the teammate they win most with (3+ games together)
  with mine as (
    select fixture_id, side, result from public.v_player_fixture_results where user_id = p_user
  ), together as (
    select o.user_id, count(*)::int as games, count(*) filter (where m.result = 'W')::int as wins
      from mine m join public.v_player_fixture_results o on o.fixture_id = m.fixture_id and o.side = m.side and o.user_id <> p_user
     group by o.user_id
  )
  select p.display_name, round(100.0 * t.wins / t.games)::int as pct into v_best
    from together t join public.profiles p on p.id = t.user_id
   where t.games >= 3 and t.wins > 0 and not public.is_blocked_between(p_user, t.user_id)
   order by t.wins::numeric / t.games desc, t.games desc, t.user_id
   limit 1;
  if v_best.display_name is not null then
    v_parts := v_parts || ('Best with ' || split_part(v_best.display_name, ' ', 1) || ' (' || v_best.pct || '% wins)');
  end if;

  if v_next.name is not null then
    v_parts := v_parts || ('Next: ' || v_next.name || ', ' || to_char(v_next.starts_at at time zone 'Europe/London', 'Dy HH24:MI'));
  end if;

  v_body := array_to_string(v_parts, ' · ');
  return jsonb_build_object('title', v_title, 'body', case when v_body = '' then 'Tap to see your stats.' else v_body || '.' end);
end $$;

create or replace function public.send_weekly_recaps(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare r record; v jsonb; v_sent int := 0;
begin
  for r in
    select distinct u.user_id from (
      select user_id from public.session_player_statistics where played_at > p_now - interval '7 days' and played_at <= p_now
      union
      select a.user_id from public.session_attendance a join public.sessions s on s.id = a.session_id
       where a.status = 'confirmed' and s.status = 'scheduled' and s.starts_at > p_now and s.starts_at <= p_now + interval '7 days'
    ) u
    join public.profiles p on p.id = u.user_id and p.onboarded
    where not exists (select 1 from public.notifications n
                       where n.user_id = u.user_id and n.type = 'week_recap' and n.created_at > p_now - interval '6 days')
  loop
    v := public.weekly_recap_for(r.user_id, p_now);
    if v is null then continue; end if;
    perform public.notify(r.user_id, 'week_recap', v ->> 'title', v ->> 'body', jsonb_build_object('recap', true));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

revoke execute on function public.weekly_recap_for(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.send_weekly_recaps(timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Sunday 18:13 UTC (6pm in winter, 7pm in summer)
    perform cron.schedule('matchday-weekly-recap', '13 18 * * 0', 'select public.send_weekly_recaps()');
  end if;
exception when others then
  raise notice 'Could not schedule weekly recaps: %', sqlerrm;
end $$;
