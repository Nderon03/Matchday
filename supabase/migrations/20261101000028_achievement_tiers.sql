-- Achievements v2: tiers, categories, more football-shaped goals, a weekly playing streak,
-- and one RPC that gives the app everything for the achievements screen (progress + rarity).

alter table public.achievements
  add column if not exists tier text not null default 'common' check (tier in ('common', 'rare', 'epic', 'legendary')),
  add column if not exists category text not null default 'Playing';

-- Catalogue (mirrored in src/domain/achievements.ts).
insert into public.achievements (code, name, description, icon, threshold, sort_order, tier, category) values
  ('first_match',     'First Match',      'Play your first verified session.',            'shirt',            1,   1, 'common',    'Playing'),
  ('apps_10',         'Regular',          'Play 10 verified sessions.',                   'people',           10,  2, 'common',    'Playing'),
  ('apps_50',         '50 Appearances',   'Play 50 verified sessions.',                   'medal',            50,  3, 'rare',      'Playing'),
  ('apps_100',        'Club Legend',      'Play 100 verified sessions.',                  'shield',           100, 4, 'epic',      'Playing'),
  ('weeks_5',         'Never Misses',     'Play 5 weeks in a row.',                       'calendar',         5,   5, 'common',    'Playing'),
  ('weeks_20',        'Ever-present',     'Play 20 weeks in a row.',                      'flame',            20,  6, 'epic',      'Playing'),
  ('first_goal',      'First Goal',       'Score your first approved goal.',              'football',         1,   10, 'common',   'Scoring'),
  ('hat_trick',       'Hat-trick Hero',   'Score 3 or more goals in a single session.',   'flash',            3,   11, 'rare',     'Scoring'),
  ('goals_25',        'Goal Machine',     'Score 25 approved goals.',                     'locate',           25,  12, 'rare',     'Scoring'),
  ('goals_100',       'Century',          'Score 100 approved goals.',                    'rocket',           100, 13, 'epic',     'Scoring'),
  ('first_assist',    'First Assist',     'Set up your first approved goal.',             'git-merge',        1,   20, 'common',   'Playmaking'),
  ('assists_25',      'Playmaker',        'Make 25 approved assists.',                    'compass',          25,  21, 'rare',     'Playmaking'),
  ('first_motm',      'First MOTM',       'Win Man of the Match for the first time.',     'star',             1,   30, 'common',   'Awards'),
  ('motm_10',         '10 MOTM Awards',   'Win Man of the Match 10 times.',               'trophy',           10,  31, 'epic',     'Awards'),
  ('season_champion', 'Season Champion',  'Be named Player of the Season.',               'ribbon',           1,   32, 'legendary','Awards'),
  ('win_streak_5',    'Five in a Row',    'Win 5 consecutive games.',                     'trending-up',      5,   40, 'rare',     'Form'),
  ('unbeaten_10',     'Unbeaten Run',     'Go 10 consecutive games without defeat.',      'shield-checkmark', 10,  41, 'epic',     'Form')
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon,
  threshold = excluded.threshold, sort_order = excluded.sort_order, tier = excluded.tier, category = excluded.category;

-- Weeks (Monday to Sunday, UK time) in a row with a verified, finalised session.
-- The current streak is still alive if the last game was this week or last week.
create or replace function public.player_week_streak(p_user uuid)
returns table (current_weeks int, best_weeks int)
language sql stable security definer set search_path = public as $$
  with weeks as (
    select distinct date_trunc('week', played_at at time zone 'Europe/London')::date as wk
      from public.session_player_statistics where user_id = p_user
  ), runs as (
    select wk, wk - (row_number() over (order by wk) * 7)::int as grp from weeks
  ), islands as (
    select count(*)::int as len, max(wk) as last_wk from runs group by grp
  )
  select coalesce((select len from islands
                    where last_wk >= date_trunc('week', now() at time zone 'Europe/London')::date - 7
                    order by last_wk desc limit 1), 0),
         coalesce((select max(len) from islands), 0);
$$;

create or replace function public.award_achievements(p_user uuid, p_session uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare c record; s record; w record; v_code text; v_new int := 0; v_name text;
  v_quiet boolean := coalesce(current_setting('matchday.quiet_achievements', true), '') = 'on';
begin
  select * into c from public.v_career_stats where user_id = p_user;
  if c.user_id is null then return 0; end if;
  select * into s from public.player_streaks(p_user);
  select * into w from public.player_week_streak(p_user);
  for v_code in
    select code from (values
      ('first_match', c.sessions >= 1),
      ('apps_10', c.sessions >= 10),
      ('apps_50', c.sessions >= 50),
      ('apps_100', c.sessions >= 100),
      ('weeks_5', w.best_weeks >= 5),
      ('weeks_20', w.best_weeks >= 20),
      ('first_goal', c.goals >= 1),
      ('hat_trick', exists (select 1 from public.session_player_statistics where user_id = p_user and goals >= 3)),
      ('goals_25', c.goals >= 25),
      ('goals_100', c.goals >= 100),
      ('first_assist', c.assists >= 1),
      ('assists_25', c.assists >= 25),
      ('first_motm', c.motm >= 1),
      ('motm_10', c.motm >= 10),
      ('season_champion', exists (select 1 from public.season_awards where user_id = p_user and award = 'player_of_season')),
      ('win_streak_5', s.best_win_streak >= 5),
      ('unbeaten_10', s.best_unbeaten >= 10)
    ) t(code, ok) where ok
  loop
    insert into public.player_achievements (user_id, achievement_code, session_id) values (p_user, v_code, p_session)
    on conflict (user_id, achievement_code) do nothing;
    if found then
      v_new := v_new + 1;
      if not v_quiet then
        select name into v_name from public.achievements where code = v_code;
        perform public.notify(p_user, 'achievement_unlocked', 'Achievement unlocked: ' || v_name, (select description from public.achievements where code = v_code),
          jsonb_build_object('achievement', v_code));
        perform public.post_activity(p_user, 'achievement', jsonb_build_object('code', v_code, 'name', v_name),
          (select group_id from public.sessions where id = p_session), p_session);
      end if;
    end if;
  end loop;
  return v_new;
end $$;
revoke execute on function public.award_achievements(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.player_week_streak(uuid) from public, anon, authenticated;

-- Everything the achievements screen needs for the signed-in player: progress towards each
-- achievement, when it was unlocked, how many players hold it, and the weekly streak.
create or replace function public.get_my_achievements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c record; s record; w record; v_players int; v_max_goals int; v_champ boolean;
begin
  if v_uid is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  select * into c from public.v_career_stats where user_id = v_uid;
  select * into s from public.player_streaks(v_uid);
  select * into w from public.player_week_streak(v_uid);
  select coalesce(max(goals), 0) into v_max_goals from public.session_player_statistics where user_id = v_uid;
  v_champ := exists (select 1 from public.season_awards where user_id = v_uid and award = 'player_of_season');
  select count(distinct user_id) into v_players from public.session_player_statistics;
  return jsonb_build_object(
    'players', v_players,
    'streak', jsonb_build_object('current', coalesce(w.current_weeks, 0), 'best', coalesce(w.best_weeks, 0)),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'code', a.code, 'name', a.name, 'description', a.description, 'icon', a.icon, 'tier', a.tier,
          'category', a.category, 'target', a.threshold,
          'progress', least(a.threshold, case a.code
             when 'first_match' then coalesce(c.sessions, 0) when 'apps_10' then coalesce(c.sessions, 0)
             when 'apps_50' then coalesce(c.sessions, 0) when 'apps_100' then coalesce(c.sessions, 0)
             when 'weeks_5' then coalesce(w.best_weeks, 0) when 'weeks_20' then coalesce(w.best_weeks, 0)
             when 'first_goal' then coalesce(c.goals, 0) when 'goals_25' then coalesce(c.goals, 0) when 'goals_100' then coalesce(c.goals, 0)
             when 'hat_trick' then v_max_goals
             when 'first_assist' then coalesce(c.assists, 0) when 'assists_25' then coalesce(c.assists, 0)
             when 'first_motm' then coalesce(c.motm, 0) when 'motm_10' then coalesce(c.motm, 0)
             when 'season_champion' then case when v_champ then 1 else 0 end
             when 'win_streak_5' then coalesce(s.best_win_streak, 0) when 'unbeaten_10' then coalesce(s.best_unbeaten, 0)
             else 0 end),
          'unlocked_at', pa.unlocked_at,
          'holders', (select count(*) from public.player_achievements x where x.achievement_code = a.code)
        ) order by a.sort_order), '[]'::jsonb)
      from public.achievements a
      left join public.player_achievements pa on pa.achievement_code = a.code and pa.user_id = v_uid
    )
  );
end $$;
grant execute on function public.get_my_achievements() to authenticated;

-- Give existing players the new achievements they already qualify for, without notifications.
do $$
declare u uuid;
begin
  perform set_config('matchday.quiet_achievements', 'on', true);
  for u in select distinct user_id from public.session_player_statistics loop
    perform public.award_achievements(u);
  end loop;
  perform set_config('matchday.quiet_achievements', 'off', true);
end $$;
