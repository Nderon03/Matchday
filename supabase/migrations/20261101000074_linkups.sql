-- Link-ups: who a player plays best alongside. Every teammate they've shared at least 3 games with,
-- ranked by how often they win together, with how much better (or worse) that is than their usual
-- win rate ("lift"). Optionally within one group. Same privacy rules as partners and rivals.
create or replace function public.get_player_linkups(p_user uuid, p_group uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_viewer uuid := public.require_user();
  v_games int; v_wins int; v_base numeric; v_list jsonb;
begin
  if public.is_blocked_between(p_user, v_viewer) or not public.can_view_profile_details(p_user, v_viewer) then
    return null;
  end if;
  if p_group is not null and not public.can_view_group(p_group, v_viewer) then
    perform public.raise_app_error('forbidden', 'You can''t see this group');
  end if;

  select count(*)::int, count(*) filter (where result = 'W')::int into v_games, v_wins
    from public.v_player_fixture_results where user_id = p_user and (p_group is null or group_id = p_group);
  v_base := case when v_games > 0 then 100.0 * v_wins / v_games else 0 end;

  with mine as (
    select fixture_id, side, result from public.v_player_fixture_results
     where user_id = p_user and (p_group is null or group_id = p_group)
  ), together as (
    select o.user_id, count(*)::int as games,
           count(*) filter (where m.result = 'W')::int as wins,
           count(*) filter (where m.result = 'D')::int as draws,
           count(*) filter (where m.result = 'L')::int as losses
      from mine m join public.v_player_fixture_results o on o.fixture_id = m.fixture_id and o.side = m.side and o.user_id <> p_user
     group by o.user_id
  ), ranked as (
    select t.*, round(100.0 * t.wins / t.games)::int as win_pct
      from together t
     where t.games >= 3 and not public.is_blocked_between(t.user_id, v_viewer)
     order by t.wins::numeric / t.games desc, t.games desc, t.user_id
     limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'player', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url),
           'games', r.games, 'wins', r.wins, 'draws', r.draws, 'losses', r.losses, 'win_pct', r.win_pct,
           'lift', round(r.win_pct - v_base)::int)
         order by r.wins::numeric / r.games desc, r.games desc, r.user_id), '[]'::jsonb)
    into v_list
    from ranked r join public.profiles p on p.id = r.user_id;

  return jsonb_build_object('games', v_games, 'win_pct', round(v_base)::int, 'linkups', v_list);
end $$;

-- Best duos in a group: the pairs who win most when they're on the same team (at least 4 games together).
create or replace function public.get_group_duos(p_group uuid, p_season uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user(); v_list jsonb;
begin
  if not public.can_view_group(p_group, v_viewer) then
    perform public.raise_app_error('forbidden', 'You can''t see this group');
  end if;

  with r as (
    select * from public.v_player_fixture_results where group_id = p_group and (p_season is null or season_id = p_season)
  ), pairs as (
    select a.user_id as a_id, b.user_id as b_id, count(*)::int as games,
           count(*) filter (where a.result = 'W')::int as wins,
           count(*) filter (where a.result = 'D')::int as draws,
           count(*) filter (where a.result = 'L')::int as losses
      from r a join r b on b.fixture_id = a.fixture_id and b.side = a.side and b.user_id > a.user_id
     group by a.user_id, b.user_id
  ), top as (
    select * from pairs
     where games >= 4 and wins > 0
       and not public.is_blocked_between(a_id, v_viewer) and not public.is_blocked_between(b_id, v_viewer)
     order by wins::numeric / games desc, games desc, a_id, b_id
     limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'a', jsonb_build_object('id', pa.id, 'username', pa.username, 'display_name', pa.display_name, 'avatar_url', pa.avatar_url),
           'b', jsonb_build_object('id', pb.id, 'username', pb.username, 'display_name', pb.display_name, 'avatar_url', pb.avatar_url),
           'games', t.games, 'wins', t.wins, 'draws', t.draws, 'losses', t.losses,
           'win_pct', round(100.0 * t.wins / t.games)::int)
         order by t.wins::numeric / t.games desc, t.games desc, t.a_id, t.b_id), '[]'::jsonb)
    into v_list
    from top t join public.profiles pa on pa.id = t.a_id join public.profiles pb on pb.id = t.b_id;
  return v_list;
end $$;

revoke execute on function public.get_player_linkups(uuid, uuid) from public, anon;
revoke execute on function public.get_group_duos(uuid, uuid) from public, anon;
grant execute on function public.get_player_linkups(uuid, uuid) to authenticated;
grant execute on function public.get_group_duos(uuid, uuid) to authenticated;
