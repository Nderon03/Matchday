-- Achievements as levelled tracks (Bronze → Legend) instead of one card per milestone, plus
-- player card styles unlocked by medal points. Existing unlocks are carried over.

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
alter table public.achievements drop constraint if exists achievements_tier_check;
alter table public.achievements alter column tier set default 'bronze';
alter table public.achievements
  add column if not exists track text,
  add column if not exists level int check (level between 1 and 5);

-- track, name, icon, thresholds per level, description pattern ({n} = threshold), first-level wording
with tracks(track, name, icon, t, pattern, first, sort) as (values
  ('apps',     'Appearances',      'shirt',            array[1, 10, 25, 50, 100], 'Play {n} verified sessions.',     'Play your first verified session.', 1),
  ('goals',    'Goals',            'football',         array[1, 10, 25, 50, 100], 'Score {n} approved goals.',       'Score your first approved goal.',   2),
  ('assists',  'Assists',          'git-merge',        array[1, 10, 25, 50, 100], 'Make {n} approved assists.',      'Set up your first approved goal.',  3),
  ('motm',     'Man of the Match', 'star',             array[1, 5, 10, 25, 50],   'Win Man of the Match {n} times.', 'Win Man of the Match.',             4),
  ('weeks',    'Ever-present',     'flame',            array[3, 5, 10, 20, 40],   'Play {n} weeks in a row.',        null,                                5),
  ('wins',     'Win Streak',       'trending-up',      array[3, 5, 7, 10, 15],    'Win {n} games in a row.',         null,                                6),
  ('unbeaten', 'Unbeaten Run',     'shield-checkmark', array[5, 10, 15, 20, 30],  'Go {n} games in a row unbeaten.', null,                                7),
  ('haul',     'Big Game',         'flash',            array[2, 3, 4, 5, 6],      'Score {n} goals in one session.', null,                                8)
)
insert into public.achievements (code, name, description, icon, threshold, sort_order, tier, category, track, level)
select t.track || '_l' || l, t.name,
       case when l = 1 and t.first is not null then t.first else replace(t.pattern, '{n}', t.t[l]::text) end,
       t.icon, t.t[l], t.sort * 10 + l,
       (array['bronze', 'silver', 'gold', 'platinum', 'legend'])[l], t.track, t.track, l
from tracks t cross join generate_series(1, 5) l
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, threshold = excluded.threshold,
  sort_order = excluded.sort_order, tier = excluded.tier, category = excluded.category, track = excluded.track, level = excluded.level;

update public.achievements set tier = 'legend', category = 'special', track = null, level = null, sort_order = 100,
  name = 'Season Champion', description = 'Be named Player of the Season.'
 where code = 'season_champion';

-- carry old one-off achievements over to their level in the new tracks (keeping the unlock date)
with map(old, new) as (values
  ('first_match', 'apps_l1'), ('apps_10', 'apps_l2'), ('apps_50', 'apps_l4'), ('apps_100', 'apps_l5'),
  ('weeks_5', 'weeks_l2'), ('weeks_20', 'weeks_l4'),
  ('first_goal', 'goals_l1'), ('goals_25', 'goals_l3'), ('goals_100', 'goals_l5'),
  ('first_assist', 'assists_l1'), ('assists_25', 'assists_l3'),
  ('first_motm', 'motm_l1'), ('motm_10', 'motm_l3'),
  ('hat_trick', 'haul_l2'), ('win_streak_5', 'wins_l2'), ('unbeaten_10', 'unbeaten_l2')
)
insert into public.player_achievements (user_id, achievement_code, session_id, unlocked_at)
select pa.user_id, m.new, pa.session_id, pa.unlocked_at
  from public.player_achievements pa join map m on m.old = pa.achievement_code
on conflict (user_id, achievement_code) do nothing;
delete from public.player_achievements where achievement_code in (
  'first_match', 'apps_10', 'apps_50', 'apps_100', 'weeks_5', 'weeks_20', 'first_goal', 'goals_25', 'goals_100',
  'first_assist', 'assists_25', 'first_motm', 'motm_10', 'hat_trick', 'win_streak_5', 'unbeaten_10');
delete from public.achievements where code in (
  'first_match', 'apps_10', 'apps_50', 'apps_100', 'weeks_5', 'weeks_20', 'first_goal', 'goals_25', 'goals_100',
  'first_assist', 'assists_25', 'first_motm', 'motm_10', 'hat_trick', 'win_streak_5', 'unbeaten_10');

alter table public.achievements add constraint achievements_tier_check check (tier in ('bronze', 'silver', 'gold', 'platinum', 'legend'));

-- ---------------------------------------------------------------------------
-- Track values and awarding
-- ---------------------------------------------------------------------------
-- The number each track is measured by, for one player.
create or replace function public.achievement_values(p_user uuid)
returns table (track text, value int)
language plpgsql stable security definer set search_path = public as $$
declare c record; s record; w record; v_haul int;
begin
  select * into c from public.v_career_stats where user_id = p_user;
  select * into s from public.player_streaks(p_user);
  select * into w from public.player_week_streak(p_user);
  select coalesce(max(goals), 0) into v_haul from public.session_player_statistics where user_id = p_user;
  return query values
    ('apps', coalesce(c.sessions, 0)), ('goals', coalesce(c.goals, 0)), ('assists', coalesce(c.assists, 0)),
    ('motm', coalesce(c.motm, 0)), ('weeks', coalesce(w.best_weeks, 0)), ('wins', coalesce(s.best_win_streak, 0)),
    ('unbeaten', coalesce(s.best_unbeaten, 0)), ('haul', v_haul),
    ('season_champion', (select count(*)::int from public.season_awards sa where sa.user_id = p_user and sa.award = 'player_of_season'));
end $$;

create or replace function public.award_achievements(p_user uuid, p_session uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare a record; v_new int := 0; v_at timestamptz;
  v_quiet boolean := coalesce(current_setting('matchday.quiet_achievements', true), '') = 'on';
begin
  if not exists (select 1 from public.session_player_statistics where user_id = p_user) then return 0; end if;
  -- quiet (backfill) unlocks are dated with the player's earliest unlock so they aren't celebrated as new
  v_at := case when v_quiet then coalesce((select min(unlocked_at) from public.player_achievements where user_id = p_user), now()) else now() end;
  for a in
    select ach.code, ach.name, ach.tier, ach.description
      from public.achievements ach
      join public.achievement_values(p_user) v on v.track = coalesce(ach.track, ach.code)
     where v.value >= ach.threshold
     order by ach.sort_order
  loop
    insert into public.player_achievements (user_id, achievement_code, session_id, unlocked_at) values (p_user, a.code, p_session, v_at)
    on conflict (user_id, achievement_code) do nothing;
    if found then
      v_new := v_new + 1;
      if not v_quiet then
        perform public.notify(p_user, 'achievement_unlocked',
          'Achievement unlocked: ' || a.name || case when a.code = 'season_champion' then '' else ' · ' || initcap(a.tier) end,
          a.description, jsonb_build_object('achievement', a.code));
        perform public.post_activity(p_user, 'achievement',
          jsonb_build_object('code', a.code, 'name', a.name || case when a.code = 'season_champion' then '' else ' (' || initcap(a.tier) || ')' end),
          (select group_id from public.sessions where id = p_session), p_session);
      end if;
    end if;
  end loop;
  return v_new;
end $$;

-- Medal points: Bronze 1 … Legend 5 for the best level in each track.
create or replace function public.medal_points(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(best), 0)::int from (
    select max(a.level) best from public.player_achievements pa join public.achievements a on a.code = pa.achievement_code
     where pa.user_id = p_user and a.track is not null group by a.track
  ) t;
$$;

revoke execute on function public.award_achievements(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.achievement_values(uuid) from public, anon, authenticated;
revoke execute on function public.medal_points(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Player card styles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists card_style text not null default 'classic'
  check (card_style in ('classic', 'silver', 'gold', 'platinum', 'hall_of_fame'));

create or replace function public.card_style_points(p_style text)
returns int language sql immutable as $$
  select case p_style when 'classic' then 0 when 'silver' then 8 when 'gold' then 16 when 'platinum' then 26 when 'hall_of_fame' then 40 end;
$$;

create or replace function public.set_card_style(p_style text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_need int := public.card_style_points(p_style);
begin
  if v_uid is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  if v_need is null then perform public.raise_app_error('invalid_style', 'That card style doesn’t exist.'); end if;
  if public.medal_points(v_uid) < v_need then
    perform public.raise_app_error('style_locked', 'Earn more medals to unlock this card style.');
  end if;
  update public.profiles set card_style = p_style where id = v_uid;
  return p_style;
end $$;
grant execute on function public.set_card_style(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Achievements screen data
-- ---------------------------------------------------------------------------
create or replace function public.get_my_achievements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); w record;
begin
  if v_uid is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  select * into w from public.player_week_streak(v_uid);
  return jsonb_build_object(
    'players', (select count(distinct user_id) from public.session_player_statistics),
    'streak', jsonb_build_object('current', coalesce(w.current_weeks, 0), 'best', coalesce(w.best_weeks, 0)),
    'points', public.medal_points(v_uid),
    'card_style', (select card_style from public.profiles where id = v_uid),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'code', a.code, 'name', a.name, 'description', a.description, 'icon', a.icon, 'tier', a.tier,
          'track', coalesce(a.track, a.code), 'level', a.level, 'target', a.threshold, 'value', v.value,
          'unlocked_at', pa.unlocked_at,
          'holders', (select count(*) from public.player_achievements x where x.achievement_code = a.code)
        ) order by a.sort_order), '[]'::jsonb)
      from public.achievements a
      join public.achievement_values(v_uid) v on v.track = coalesce(a.track, a.code)
      left join public.player_achievements pa on pa.achievement_code = a.code and pa.user_id = v_uid
    )
  );
end $$;
grant execute on function public.get_my_achievements() to authenticated;

-- Fill in lower levels players already qualify for (e.g. 30 goals → Goals Silver and Gold), quietly.
do $$
declare u uuid;
begin
  perform set_config('matchday.quiet_achievements', 'on', true);
  for u in select distinct user_id from public.session_player_statistics loop
    perform public.award_achievements(u);
  end loop;
  perform set_config('matchday.quiet_achievements', 'off', true);
end $$;
