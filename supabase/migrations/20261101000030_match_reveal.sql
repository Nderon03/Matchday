-- After-match reveal and personal bests.

-- Games the signed-in player played that were finalised in the last 14 days, with their numbers
-- and their previous bests (from games played before this one), so the app can show a short
-- "your match" card once per game and only call out records that mean something.
create or replace function public.get_match_reveals()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  return (
    select coalesce(jsonb_agg(r order by r.finalised_at), '[]'::jsonb) from (
      select s.id as session_id, s.name, s.starts_at as played_at, s.finalised_at, g.name as group_name,
             st.fixtures_played, st.wins, st.draws, st.losses, st.goals, st.assists,
             st.rating_avg, st.rating_eligible, st.motm, st.motm_shared,
             (select coalesce(max(p.goals), 0) from public.session_player_statistics p
               where p.user_id = v_uid and p.played_at < st.played_at) as prev_max_goals,
             (select coalesce(max(p.assists), 0) from public.session_player_statistics p
               where p.user_id = v_uid and p.played_at < st.played_at) as prev_max_assists,
             (select max(p.rating_avg) from public.session_player_statistics p
               where p.user_id = v_uid and p.played_at < st.played_at and p.rating_eligible) as prev_best_rating,
             (select count(*) from public.session_player_statistics p
               where p.user_id = v_uid and p.played_at < st.played_at and p.rating_eligible)::int as prev_rated
        from public.session_player_statistics st
        join public.sessions s on s.id = st.session_id
        left join public.groups g on g.id = s.group_id
       where st.user_id = v_uid and s.status = 'finalised' and s.finalised_at > now() - interval '14 days'
    ) r
  );
end $$;
grant execute on function public.get_match_reveals() to authenticated;

-- A player's personal bests, visible to whoever can see their statistics.
create or replace function public.get_personal_bests(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user(); s record; w record;
begin
  if public.is_blocked_between(p_user, v_viewer) or not public.can_view_profile_details(p_user, v_viewer) then
    return null;
  end if;
  select * into s from public.player_streaks(p_user);
  select * into w from public.player_week_streak(p_user);
  return jsonb_build_object(
    'best_rating', (select jsonb_build_object('value', st.rating_avg, 'session_id', st.session_id, 'name', se.name, 'played_at', st.played_at)
                      from public.session_player_statistics st join public.sessions se on se.id = st.session_id
                     where st.user_id = p_user and st.rating_eligible order by st.rating_avg desc, st.played_at limit 1),
    'most_goals', (select jsonb_build_object('value', st.goals, 'session_id', st.session_id, 'name', se.name, 'played_at', st.played_at)
                     from public.session_player_statistics st join public.sessions se on se.id = st.session_id
                    where st.user_id = p_user and st.goals > 0 order by st.goals desc, st.played_at limit 1),
    'most_assists', (select jsonb_build_object('value', st.assists, 'session_id', st.session_id, 'name', se.name, 'played_at', st.played_at)
                       from public.session_player_statistics st join public.sessions se on se.id = st.session_id
                      where st.user_id = p_user and st.assists > 0 order by st.assists desc, st.played_at limit 1),
    'best_win_streak', coalesce(s.best_win_streak, 0),
    'best_unbeaten', coalesce(s.best_unbeaten, 0),
    'best_weeks', coalesce(w.best_weeks, 0)
  );
end $$;
grant execute on function public.get_personal_bests(uuid) to authenticated;
