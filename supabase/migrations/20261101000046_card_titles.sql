-- Player card titles (a short line under your name). The list and unlock rules mirror
-- src/domain/titles.ts: 'free', 'medal:<code>', 'points:<n>' or 'reliable'.
alter table public.profiles add column if not exists card_title text;

create or replace function public.card_title_requirement(p_title text)
returns text language sql immutable as $$
  select case p_title
    when 'weekend_warrior' then 'free'
    when 'sunday_leaguer' then 'free'
    when 'bib_collector' then 'free'
    when 'astro_turfer' then 'free'
    when 'jumpers_for_goalposts' then 'free'
    when 'tekkers_trainee' then 'free'
    when 'fresh_boots' then 'medal:apps_l1'
    when 'club_regular' then 'medal:apps_l3'
    when 'centurion' then 'medal:apps_l5'
    when 'off_the_mark' then 'medal:goals_l1'
    when 'poacher' then 'medal:goals_l3'
    when 'goal_machine' then 'medal:goals_l5'
    when 'brace_yourself' then 'medal:haul_l1'
    when 'hat_trick_hero' then 'medal:haul_l2'
    when 'provider' then 'medal:assists_l2'
    when 'architect' then 'medal:assists_l4'
    when 'man_of_the_moment' then 'medal:motm_l1'
    when 'baller' then 'medal:motm_l3'
    when 'main_character' then 'medal:motm_l5'
    when 'ever_present' then 'medal:weeks_l2'
    when 'serial_winner' then 'medal:wins_l3'
    when 'brick_wall' then 'medal:unbeaten_l3'
    when 'always_turns_up' then 'reliable'
    when 'player_of_the_season' then 'medal:season_champion'
    when 'elite' then 'points:26'
    when 'legend' then 'points:40'
  end;
$$;

create or replace function public.set_card_title(p_title text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req text := public.card_title_requirement(p_title);
  v_rel jsonb;
begin
  if v_uid is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  if p_title is null then
    update public.profiles set card_title = null where id = v_uid;
    return null;
  end if;
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
