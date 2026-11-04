-- Team of the Month: each group member's numbers for a calendar month (UK time), for the app
-- to pick the best five from. Only members of the group can see it.
create or replace function public.get_month_candidates(p_group uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user();
  v_from timestamptz := (date_trunc('month', p_month)::timestamp at time zone 'Europe/London');
  v_to timestamptz := ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Europe/London');
begin
  if not public.is_group_member(p_group, v_viewer) then
    perform public.raise_app_error('forbidden', 'Only group members can see this.');
  end if;
  return jsonb_build_object(
    'sessions', (select count(*) from public.sessions s where s.group_id = p_group and s.status = 'finalised' and s.starts_at >= v_from and s.starts_at < v_to),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', p.id, 'display_name', p.display_name, 'username', p.username, 'avatar_url', p.avatar_url, 'position', p.position,
          'rated', x.rated, 'rating', x.rating, 'goals', x.goals, 'assists', x.assists, 'motm', x.motm, 'apps', x.apps)), '[]'::jsonb)
      from (
        select st.user_id, count(*) filter (where st.rating_eligible)::int as rated,
               round(avg(st.rating_avg) filter (where st.rating_eligible), 2) as rating,
               sum(st.goals)::int as goals, sum(st.assists)::int as assists,
               count(*) filter (where st.motm)::int as motm, count(*)::int as apps
          from public.session_player_statistics st
         where st.group_id = p_group and st.played_at >= v_from and st.played_at < v_to
           and public.is_group_member(p_group, st.user_id)
           and not public.is_blocked_between(st.user_id, v_viewer)
         group by st.user_id
      ) x join public.profiles p on p.id = x.user_id
    )
  );
end $$;
grant execute on function public.get_month_candidates(uuid, date) to authenticated;
