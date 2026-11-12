-- Season badges unlock matching card titles: 'season:s1_champion' shows "S1 Champion",
-- 'season:pre' shows "Pre-season". (Player of the Season also keeps its own title.)
create or replace function public.set_card_title(p_title text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req text;
  v_rel jsonb;
begin
  if v_uid is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  if p_title is null then
    update public.profiles set card_title = null where id = v_uid;
    return null;
  end if;
  -- a season title: you need that season badge
  if p_title like 'season:%' then
    if not exists (select 1 from public.season_badges where user_id = v_uid and code = substr(p_title, 8)) then
      perform public.raise_app_error('title_locked', 'Earn that season badge to use its title.');
    end if;
    update public.profiles set card_title = p_title where id = v_uid;
    return p_title;
  end if;
  v_req := public.card_title_requirement(p_title);
  if v_req is null then perform public.raise_app_error('invalid', 'That title doesn’t exist.'); end if;
  if (v_req like 'medal:%' and not exists (select 1 from public.player_achievements where user_id = v_uid and achievement_code = substr(v_req, 7)))
     or (v_req like 'points:%' and public.medal_points(v_uid) < substr(v_req, 8)::int) then
    perform public.raise_app_error('title_locked', 'You haven’t unlocked that title yet.');
  end if;
  if v_req = 'reliable' then
    v_rel := public.get_reliability(array[v_uid]) -> v_uid::text;
    if coalesce((v_rel ->> 'pct')::int, 0) < 100 or coalesce((v_rel ->> 'attended')::int, 0) < 10 then
      perform public.raise_app_error('title_locked', 'Be 100% reliable over 10 or more games to unlock that title.');
    end if;
  end if;
  update public.profiles set card_title = p_title where id = v_uid;
  return p_title;
end $$;
revoke execute on function public.set_card_title(text) from public, anon;
grant execute on function public.set_card_title(text) to authenticated;
