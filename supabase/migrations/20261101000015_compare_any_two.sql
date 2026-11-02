-- Compare any two players (not just yourself), optionally within one group:
-- stats, form and the rivalry are then limited to that group's sessions.
drop function if exists public.get_head_to_head(uuid, uuid);

create or replace function public.player_summary(p_user uuid, p_group uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sessions', count(*), 'fixtures', coalesce(sum(fixtures_played), 0),
    'wins', coalesce(sum(wins), 0), 'draws', coalesce(sum(draws), 0), 'losses', coalesce(sum(losses), 0),
    'goals', coalesce(sum(goals), 0), 'assists', coalesce(sum(assists), 0),
    'motm', count(*) filter (where motm),
    'rating', round(avg(rating_avg) filter (where rating_eligible), 2),
    'rated_sessions', count(*) filter (where rating_eligible),
    'win_pct', case when sum(fixtures_played) > 0 then round(100.0 * sum(wins) / sum(fixtures_played), 1) else 0 end
  )
  from public.session_player_statistics where user_id = p_user and (p_group is null or group_id = p_group);
$$;
revoke execute on function public.player_summary(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_head_to_head(p_a uuid, p_b uuid, p_group uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user(); v_res jsonb; v_in_group boolean := false;
begin
  if p_a = p_b then perform public.raise_app_error('invalid', 'Pick two different players.'); end if;
  if p_group is not null then
    if not public.can_view_group(p_group, v_viewer) then perform public.raise_app_error('forbidden', 'Insufficient permissions.'); end if;
    -- inside a group you belong to, members' group records are visible (as on profiles)
    v_in_group := public.is_group_member(p_group, v_viewer) and public.is_group_member(p_group, p_a) and public.is_group_member(p_group, p_b);
  end if;
  if not v_in_group and not (public.can_view_profile_details(p_a, v_viewer) and public.can_view_profile_details(p_b, v_viewer)) then
    perform public.raise_app_error('forbidden', 'One of these players keeps their stats private.');
  end if;
  with opp as (
    select a.fixture_id, a.session_id, a.played_at, a.result as a_result, a.goals_for as a_score, a.goals_against as b_score
      from public.v_player_fixture_results a
      join public.v_player_fixture_results b on b.fixture_id = a.fixture_id and b.user_id = p_b and b.side <> a.side
     where a.user_id = p_a and (p_group is null or a.group_id = p_group)
  ), mates as (
    select a.result from public.v_player_fixture_results a
      join public.v_player_fixture_results b on b.fixture_id = a.fixture_id and b.user_id = p_b and b.side = a.side
     where a.user_id = p_a and (p_group is null or a.group_id = p_group)
  )
  select jsonb_build_object(
    'group_id', p_group,
    'a', public.player_summary(p_a, p_group),
    'b', public.player_summary(p_b, p_group),
    'a_form', (select round(avg(rating_avg), 1) from (select rating_avg from public.session_player_statistics where user_id = p_a and rating_eligible and (p_group is null or group_id = p_group) order by played_at desc limit 5) x),
    'b_form', (select round(avg(rating_avg), 1) from (select rating_avg from public.session_player_statistics where user_id = p_b and rating_eligible and (p_group is null or group_id = p_group) order by played_at desc limit 5) x),
    'rivalry', jsonb_build_object(
      'games', (select count(*) from opp),
      'a_wins', (select count(*) from opp where a_result = 'W'),
      'draws', (select count(*) from opp where a_result = 'D'),
      'b_wins', (select count(*) from opp where a_result = 'L'),
      'a_goals', (select coalesce(sum(pg.goals), 0) from public.player_goals pg where pg.user_id = p_a and pg.session_id in (select session_id from opp)),
      'b_goals', (select coalesce(sum(pg.goals), 0) from public.player_goals pg where pg.user_id = p_b and pg.session_id in (select session_id from opp)),
      'last', (select jsonb_build_object('session_id', o.session_id, 'played_at', o.played_at, 'a_score', o.a_score, 'b_score', o.b_score, 'name', s.name)
                 from opp o join public.sessions s on s.id = o.session_id order by o.played_at desc limit 1)
    ),
    'teammates', jsonb_build_object(
      'games', (select count(*) from mates),
      'wins', (select count(*) from mates where result = 'W')
    )
  ) into v_res;
  return v_res;
end $$;

-- invitations change when a host re-invites someone; stream them so open screens update
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'session_invitations') then
    alter publication supabase_realtime add table public.session_invitations;
  end if;
end $$;
