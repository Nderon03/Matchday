-- Numbered seasons and season badges (like ranks in a game).
--  * Season 1 is Winter 2027 (Jan–Mar 2027), Season 2 is Spring 2027, and so on. Before that it's
--    Pre-season: everyone who plays in it gets a one-off Pre-season badge (thank you, testers).
--  * When a group's season finishes, each player gets a badge for how they finished in its race:
--      Champion   Player of the Season (#1)
--      Elite      top 25% of the qualified players (at least the top 2)
--      Contender  top half
--      Regular    qualified (played at least half the group's games)
--      Squad      played 3+ games
--    The ranked tiers (Champion to Regular) need 7+ games AND 10+ different players in the group that
--    season, so no one can farm them in a tiny group; anyone else with 3+ games gets Squad.
--  * One badge per player per season: the best across all their groups. Ties share the higher badge.
--  * Badges are for show only: they don't count towards medal points.
--  * Your newest badge goes on your card automatically, until you pick one yourself (or none).

create or replace function public.season_number(p_day date)
returns int language sql immutable as $$
  select case when p_day < date '2027-01-01' then 0
              else (extract(year from p_day)::int - 2027) * 4 + extract(quarter from p_day)::int end
$$;
grant execute on function public.season_number(date) to authenticated;

create or replace function public.season_label(p_day date)
returns text language sql immutable as $$
  select case when public.season_number(p_day) = 0 then 'Pre-season' else 'Season ' || public.season_number(p_day) end
$$;
grant execute on function public.season_label(date) to authenticated;

create or replace function public.season_tier_rank(p_tier text)
returns int language sql immutable as $$
  select case p_tier when 'champion' then 5 when 'elite' then 4 when 'contender' then 3 when 'regular' then 2
                     when 'squad' then 1 when 'preseason' then 1 else 0 end
$$;

create table if not exists public.season_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quarter_start date not null,
  code text not null,
  tier text not null check (tier in ('champion', 'elite', 'contender', 'regular', 'squad', 'preseason')),
  season_id uuid references public.seasons(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, quarter_start)
);
alter table public.season_badges enable row level security;
drop policy if exists "season badges readable" on public.season_badges;
create policy "season badges readable" on public.season_badges for select to authenticated using (true);
grant select on public.season_badges to authenticated;

alter table public.profiles add column if not exists card_season text;
alter table public.profiles add column if not exists card_season_auto boolean not null default true;

-- give a player a badge for a season, keeping only their best one
create or replace function public.give_season_badge(p_user uuid, p_quarter date, p_tier text, p_season uuid, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text; v_n int;
begin
  v_code := case when p_tier = 'preseason' then 'pre' else 's' || public.season_number(p_quarter) || '_' || p_tier end;
  insert into public.season_badges (user_id, quarter_start, code, tier, season_id, group_id)
  values (p_user, p_quarter, v_code, p_tier, p_season, p_group)
  on conflict (user_id, quarter_start) do update
    set code = excluded.code, tier = excluded.tier, season_id = excluded.season_id, group_id = excluded.group_id, created_at = now()
    where public.season_tier_rank(excluded.tier) > public.season_tier_rank(public.season_badges.tier);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    update public.profiles set card_season = v_code where id = p_user and card_season_auto;
  end if;
end $$;
revoke execute on function public.give_season_badge(uuid, date, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.award_season_badges(p_season uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.seasons; v_q date; v_games int; v_players int; v_n int; v_ranked boolean; r record; v_tier text;
begin
  select * into v_s from public.seasons where id = p_season;
  if v_s.id is null then return; end if;
  v_q := date_trunc('quarter', v_s.starts_on)::date;

  if public.season_number(v_q) = 0 then
    for r in select distinct sps.user_id from public.session_player_statistics sps
               join public.sessions s on s.id = sps.session_id and s.status = 'finalised' where sps.season_id = p_season loop
      perform public.give_season_badge(r.user_id, v_q, 'preseason', p_season, v_s.group_id);
    end loop;
    return;
  end if;

  select count(*)::int into v_games from public.sessions where season_id = p_season and status = 'finalised';
  select count(distinct sps.user_id)::int into v_players from public.session_player_statistics sps
    join public.sessions s on s.id = sps.session_id and s.status = 'finalised' where sps.season_id = p_season;
  v_ranked := v_games >= 7 and v_players >= 10;
  select count(*)::int into v_n from public.season_standings(p_season) where eligible and score is not null;

  for r in select st.*, case when st.eligible and st.score is not null
                             then rank() over (partition by (st.eligible and st.score is not null) order by st.score desc) end rk
             from public.season_standings(p_season) st loop
    v_tier := case
      when v_ranked and r.rk is not null then
        case when r.rk = 1 then 'champion'
             when r.rk <= greatest(2, ceil(v_n * 0.25)) then 'elite'
             when r.rk <= ceil(v_n * 0.5) then 'contender'
             else 'regular' end
      when v_ranked and r.eligible then 'regular'
      when r.apps >= 3 then 'squad'
    end;
    if v_tier is not null then perform public.give_season_badge(r.user_id, v_q, v_tier, p_season, v_s.group_id); end if;
  end loop;
end $$;
revoke execute on function public.award_season_badges(uuid) from public, anon, authenticated;

-- badges are handed out the moment a season is finalised (by the daily job or an admin)
create or replace function public.trg_season_badges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.award_season_badges(new.id);
  end if;
  return new;
end $$;
drop trigger if exists season_badges_on_complete on public.seasons;
create trigger season_badges_on_complete after update of status on public.seasons for each row execute function public.trg_season_badges();

-- pick the badge on your card (one you've earned), or none
create or replace function public.set_card_season(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  if p_code is not null and not exists (select 1 from public.season_badges where user_id = v_uid and code = p_code) then
    perform public.raise_app_error('title_locked', 'You haven’t earned that season badge.');
  end if;
  update public.profiles set card_season = p_code, card_season_auto = false where id = v_uid;
  return p_code;
end $$;
grant execute on function public.set_card_season(text) to authenticated;

-- Home's season info now carries the season number and your badge for each finished season
create or replace function public.get_my_seasons()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); b record;
begin
  select * into b from public.season_bounds(current_date);
  return jsonb_build_object(
    'current', jsonb_build_object('name', b.name, 'starts_on', b.starts_on, 'ends_on', b.ends_on, 'label', public.season_label(b.starts_on)),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', g.id, 'group_name', g.name, 'games', x.games, 'my_games', x.mine,
               'needed', 7, 'my_needed', greatest(1, ceil(greatest(x.games, 7) * 0.5)::int)) order by x.games desc)
        from public.group_members m join public.groups g on g.id = m.group_id
        cross join lateral (
          select count(*)::int games,
                 count(*) filter (where exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = v_uid and a.verification = 'verified'))::int mine
            from public.sessions s where s.group_id = g.id and s.status = 'finalised' and s.starts_at::date between b.starts_on and b.ends_on
        ) x
       where m.user_id = v_uid), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('season_id', se.id, 'season_name', se.name, 'season_label', public.season_label(se.starts_on),
               'group_id', g.id, 'group_name', g.name, 'finalised_at', se.finalised_at, 'games', se.games,
               'my_badge', (select sb.code from public.season_badges sb where sb.user_id = v_uid and sb.quarter_start = date_trunc('quarter', se.starts_on)::date),
               'winners', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url, 'value', sa.value))
                                      from public.season_awards sa join public.profiles p on p.id = sa.user_id
                                     where sa.season_id = se.id and sa.award = 'player_of_season'), '[]'::jsonb)) order by se.finalised_at desc)
        from public.seasons se join public.groups g on g.id = se.group_id
        join public.group_members m on m.group_id = g.id and m.user_id = v_uid
       where se.status = 'completed' and se.finalised_at > now() - interval '14 days'), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_my_seasons() to authenticated;

-- the race shows the season number too
create or replace function public.get_season_race(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); b record; v_season uuid; v_games int := 0; v_players int := 0;
begin
  if not public.is_group_member(p_group, v_uid) then perform public.raise_app_error('forbidden', 'Only members can see the season race.'); end if;
  select * into b from public.season_bounds(current_date);
  v_season := public.current_group_season(p_group);
  if v_season is not null then
    select count(*)::int into v_games from public.sessions where season_id = v_season and status = 'finalised';
    select count(distinct sps.user_id)::int into v_players from public.session_player_statistics sps
      join public.sessions s on s.id = sps.session_id and s.status = 'finalised' where sps.season_id = v_season;
  end if;
  return jsonb_build_object(
    'season_name', b.name, 'season_label', public.season_label(b.starts_on), 'ends_on', b.ends_on, 'games', v_games, 'needed', 7,
    'players', v_players, 'players_needed', 10,
    'min_apps', ceil(greatest(v_games, 7) * 0.5)::int,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', r.display_name, 'avatar_url', r.avatar_url,
               'apps', r.apps, 'rating', r.rating, 'motm', r.motm, 'score', r.score, 'eligible', r.eligible,
               'rank', case when r.ranked then r.rk end)
             order by r.ranked desc, r.score desc nulls last, r.apps desc)
        from (
          select st.*, p.display_name, p.avatar_url, (st.eligible and st.score is not null) ranked,
                 rank() over (partition by (st.eligible and st.score is not null) order by st.score desc nulls last) rk
            from public.season_standings(v_season) st
            join public.profiles p on p.id = st.user_id
            join public.group_members m on m.group_id = p_group and m.user_id = st.user_id
           where v_season is not null
        ) r), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_season_race(uuid) to authenticated;
