-- Season Wrapped: your season in one shareable card. The usual Wrapped numbers for the quarter, plus
-- your ranked badge for it (the best across your groups) and where you finished in each group's race.
create or replace function public.get_season_wrapped(p_quarter date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_q date := date_trunc('quarter', p_quarter)::date; v_end date; b record;
begin
  v_end := (v_q + interval '3 months')::date;
  select * into b from public.season_bounds(v_q);
  return public.get_wrapped(v_q::timestamptz, v_end::timestamptz, v_uid) || jsonb_build_object(
    'quarter', v_q, 'season_name', b.name, 'season_label', public.season_label(v_q), 'ends_on', b.ends_on,
    'badge', (select code from public.season_badges where user_id = v_uid and quarter_start = v_q),
    'races', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', g.id, 'group_name', g.name, 'finished', se.status = 'completed',
               'rank', x.rk, 'of', x.n, 'score', x.score, 'eligible', x.eligible, 'apps', x.apps, 'games', x.games)
             order by x.rk nulls last, x.apps desc)
        from public.seasons se
        join public.groups g on g.id = se.group_id
        cross join lateral (
          select st.apps, st.score, st.eligible, st.games,
                 (select count(*)::int from public.season_standings(se.id) o where o.eligible and o.score is not null) n,
                 case when st.eligible and st.score is not null
                      then 1 + (select count(*)::int from public.season_standings(se.id) o where o.eligible and o.score > st.score) end rk
            from public.season_standings(se.id) st where st.user_id = v_uid
        ) x
       where se.starts_on >= v_q and se.starts_on < v_end), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_season_wrapped(date) to authenticated;
