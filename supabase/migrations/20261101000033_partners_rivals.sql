-- Partners and rivals from line-ups and results: who a player wins most with, and who beats them.
-- Needs a few games together/against so it means something; hidden by the player's privacy setting.
create or replace function public.get_player_connections(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user(); v_partner jsonb; v_nemesis jsonb;
begin
  if public.is_blocked_between(p_user, v_viewer) or not public.can_view_profile_details(p_user, v_viewer) then
    return null;
  end if;

  with mine as (
    select fixture_id, side, result from public.v_player_fixture_results where user_id = p_user
  ), together as (
    select o.user_id, count(*)::int as games, count(*) filter (where m.result = 'W')::int as wins
      from mine m join public.v_player_fixture_results o on o.fixture_id = m.fixture_id and o.side = m.side and o.user_id <> p_user
     group by o.user_id
  )
  select jsonb_build_object('player', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url),
           'games', t.games, 'wins', t.wins, 'win_pct', round(100.0 * t.wins / t.games))
    into v_partner
    from together t join public.profiles p on p.id = t.user_id
   where t.games >= 5 and t.wins > 0 and not public.is_blocked_between(t.user_id, v_viewer)
   order by t.wins::numeric / t.games desc, t.games desc
   limit 1;

  with mine as (
    select fixture_id, side, result from public.v_player_fixture_results where user_id = p_user
  ), against as (
    select o.user_id, count(*)::int as games, count(*) filter (where m.result = 'L')::int as losses,
           count(*) filter (where m.result = 'W')::int as wins
      from mine m join public.v_player_fixture_results o on o.fixture_id = m.fixture_id and o.side <> m.side
     group by o.user_id
  )
  select jsonb_build_object('player', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url),
           'games', a.games, 'losses', a.losses, 'wins', a.wins)
    into v_nemesis
    from against a join public.profiles p on p.id = a.user_id
   where a.games >= 4 and a.losses > a.wins and not public.is_blocked_between(a.user_id, v_viewer)
   order by a.losses::numeric / a.games desc, a.games desc
   limit 1;

  return jsonb_build_object('partner', v_partner, 'nemesis', v_nemesis);
end $$;
grant execute on function public.get_player_connections(uuid) to authenticated;
