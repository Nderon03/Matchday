-- Leaderboards also return players who have not yet met the fair-ranking threshold
-- (e.g. 3 rated sessions for rating/form, minimum appearances for win %), flagged as
-- not qualified with their progress, so an early leaderboard never looks empty.
drop function if exists public.get_leaderboard(text, text, uuid, uuid, text, int, int);

create or replace function public.get_leaderboard(
  p_category text,
  p_scope text default 'group',
  p_group uuid default null,
  p_season uuid default null,
  p_period text default 'all',
  p_limit int default 50,
  p_offset int default 0
) returns table (
  rank int, user_id uuid, username citext, display_name text, avatar_url text,
  value numeric, appearances int, is_me boolean, total int,
  qualified boolean, progress int, needed int
) language plpgsql stable security definer set search_path = public as $$
declare
  v_viewer uuid := public.require_user();
  v_from timestamptz;
  v_min int := 5;
begin
  if p_scope = 'group' then
    if p_group is null or not public.can_view_group(p_group, v_viewer) then
      perform public.raise_app_error('forbidden', 'Insufficient permissions.');
    end if;
    select leaderboard_min_appearances into v_min from public.group_settings where group_id = p_group;
  end if;
  v_from := case p_period when 'month' then date_trunc('month', now()) when 'year' then date_trunc('year', now()) else null end;

  return query
  with base as (
    select * from public.leaderboard_rows(p_scope, p_group, p_season, v_from, null, v_viewer)
  ), agg as (
    select b.user_id,
           count(*)::int apps,
           sum(b.goals)::numeric goals, sum(b.assists)::numeric assists, sum(b.wins)::numeric wins,
           count(*) filter (where b.motm)::numeric motm,
           sum(b.fixtures_played) fixtures,
           count(*) filter (where b.rating_eligible) rated,
           avg(b.rating_avg) filter (where b.rating_eligible) rating
      from base b group by b.user_id
  ), ordered as (
    select b.user_id, b.rating_avg, row_number() over (partition by b.user_id order by b.played_at desc) rn_desc,
           count(*) over (partition by b.user_id) n
      from base b where b.rating_eligible
  ), form as (
    select o.user_id, avg(o.rating_avg) filter (where o.rn_desc <= 5) form,
           avg(o.rating_avg) filter (where o.rn_desc <= o.n / 2) recent_half,
           avg(o.rating_avg) filter (where o.rn_desc > o.n - o.n / 2) early_half,
           max(o.n) n
      from ordered o group by o.user_id
  ), vals as (
    -- value is computed whenever there is data; progress/needed describe the fair-ranking
    -- threshold (rated sessions or appearances) so unqualified players can be shown separately
    select a.user_id, a.apps,
      case p_category
        when 'goals' then a.goals
        when 'assists' then a.assists
        when 'motm' then a.motm
        when 'appearances' then a.apps::numeric
        when 'wins' then a.wins
        when 'win_pct' then case when a.fixtures > 0 then round(100.0 * a.wins / a.fixtures, 1) end
        when 'rating' then case when a.rated > 0 then round(a.rating, 2) end
        when 'form' then case when coalesce(f.n, 0) > 0 then round(f.form, 2) end
        when 'improved' then case when coalesce(f.n, 0) >= 2 then round(f.recent_half - f.early_half, 2) end
        when 'streak' then (select s.best_win_streak from public.player_streaks(a.user_id, case when p_scope = 'group' then p_group end, p_season) s)::numeric
      end as value,
      case p_category
        when 'win_pct' then a.apps
        when 'rating' then a.rated::int
        when 'form' then coalesce(f.n, 0)::int
        when 'improved' then coalesce(f.n, 0)::int
        else a.apps
      end as progress,
      case p_category when 'win_pct' then v_min when 'rating' then 3 when 'form' then 3 when 'improved' then 6 else 0 end as needed
      from agg a left join form f on f.user_id = a.user_id
  ), shown as (
    select v.*, (v.progress >= v.needed) as ok
      from vals v where v.value is not null and (v.value > 0 or p_category in ('improved', 'rating', 'form', 'win_pct'))
  ), ranked as (
    select s.*,
           case when s.ok then (rank() over (partition by s.ok order by s.value desc, s.apps asc))::int end rnk,
           (count(*) filter (where s.ok) over ())::int cnt
      from shown s
  )
  select r.rnk, r.user_id, p.username, p.display_name, p.avatar_url, r.value, r.apps, r.user_id = v_viewer, r.cnt,
         r.ok, r.progress, r.needed
    from ranked r join public.profiles p on p.id = r.user_id
   order by r.ok desc, r.rnk nulls last, r.progress desc, r.value desc, p.username
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.get_home_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_res jsonb;
begin
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'next_session', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'starts_at', s.starts_at, 'venue', s.venue, 'location', s.location,
               'format_size', s.format_size, 'max_attendance', s.max_attendance, 'payment_mode', s.payment_mode, 'price_pence', s.price_pence,
               'my_status', a.status, 'confirmed', (select count(*) from public.session_attendance x where x.session_id = s.id and x.status = 'confirmed'),
               'lineup_ready', exists (select 1 from public.fixtures f where f.session_id = s.id and f.lineup_confirmed_at is not null),
               'is_host', public.is_session_manager(s.id, v_uid))
        from public.session_attendance a join public.sessions s on s.id = a.session_id
       where a.user_id = v_uid and a.status in ('confirmed', 'waitlisted') and s.status in ('scheduled', 'in_progress')
         and s.starts_at + make_interval(mins => s.duration_minutes) > now() - interval '6 hours'
       order by s.starts_at limit 1),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.get_pending_tasks() t),
    'recent_results', (
      select coalesce(jsonb_agg(r order by r.played_at desc), '[]'::jsonb) from (
        select sps.session_id, s.name, sps.played_at, sps.wins, sps.draws, sps.losses, sps.goals, sps.rating_avg, sps.rating_eligible, sps.motm
          from public.session_player_statistics sps join public.sessions s on s.id = sps.session_id
         where sps.user_id = v_uid order by sps.played_at desc limit 3) r),
    'career', (select to_jsonb(c) from public.v_career_stats c where c.user_id = v_uid),
    'achievements', (
      select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'icon', a.icon, 'unlocked_at', pa.unlocked_at) order by pa.unlocked_at desc), '[]'::jsonb)
        from (select * from public.player_achievements where user_id = v_uid order by unlocked_at desc limit 3) pa join public.achievements a on a.code = pa.achievement_code),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'logo_url', g.logo_url,
               'my_rank', (select l.rank from public.get_leaderboard('rating', 'group', g.id) l where l.user_id = v_uid and l.qualified limit 1),
               'leader', (select jsonb_build_object('display_name', l.display_name, 'value', l.value) from public.get_leaderboard('rating', 'group', g.id) l where l.qualified order by l.rank limit 1))
             order by g.name), '[]'::jsonb)
        from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = v_uid),
    'unread_notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null)
  ) into v_res;
  return v_res;
end $$;
