-- Statistics: finalisation, derived statistics, achievements, leaderboards,
-- records, head-to-head, wrapped, seasons and the deadline processor.

-- Achievement catalogue (thresholds mirrored in src/domain/achievements.ts).
insert into public.achievements (code, name, description, icon, threshold, sort_order) values
  ('first_match', 'First Match', 'Play your first verified session.', 'shirt', 1, 1),
  ('first_goal', 'First Goal', 'Score your first approved goal.', 'football', 1, 2),
  ('first_motm', 'First MOTM', 'Win Man of the Match for the first time.', 'star', 1, 3),
  ('hat_trick', 'Hat-trick Hero', 'Score 3 or more goals in a single session.', 'flame', 3, 4),
  ('motm_10', '10 MOTM Awards', 'Win Man of the Match 10 times.', 'trophy', 10, 5),
  ('apps_50', '50 Appearances', 'Play 50 verified sessions.', 'medal', 50, 6),
  ('goals_100', 'Century', 'Score 100 approved goals.', 'rocket', 100, 7),
  ('win_streak_5', 'Five in a Row', 'Win 5 consecutive games.', 'trending-up', 5, 8),
  ('unbeaten_10', 'Unbeaten Run', 'Go 10 consecutive games without defeat.', 'shield-checkmark', 10, 9),
  ('season_champion', 'Season Champion', 'Be named Player of the Season.', 'ribbon', 1, 10)
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, threshold = excluded.threshold;

-- ---------------------------------------------------------------------------
-- Derived views (security_invoker so the caller's RLS applies)
-- ---------------------------------------------------------------------------
-- Every verified fixture appearance in a finalised session, with its result.
create or replace view public.v_player_fixture_results with (security_invoker = true) as
select tp.user_id, s.id as session_id, s.group_id, s.season_id, s.starts_at as played_at, f.id as fixture_id, f.number as fixture_number,
       ft.side, ft.score as goals_for, opp.score as goals_against,
       case when ft.score > opp.score then 'W' when ft.score = opp.score then 'D' else 'L' end as result
from public.team_players tp
join public.fixtures f on f.id = tp.fixture_id and f.played
join public.sessions s on s.id = f.session_id and s.status = 'finalised'
join public.fixture_teams ft on ft.id = tp.fixture_team_id
join public.fixture_teams opp on opp.fixture_id = f.id and opp.side <> ft.side
join public.session_attendance a on a.session_id = s.id and a.user_id = tp.user_id and a.verification = 'verified'
where ft.score is not null and opp.score is not null;

create or replace view public.v_career_stats with (security_invoker = true) as
select user_id,
       count(*)::int as sessions,
       sum(fixtures_played)::int as fixtures,
       sum(wins)::int as wins, sum(draws)::int as draws, sum(losses)::int as losses,
       sum(goals)::int as goals, sum(assists)::int as assists,
       sum(goals_for)::int as goals_for, sum(goals_against)::int as goals_against,
       count(*) filter (where motm)::int as motm,
       round(avg(rating_avg) filter (where rating_eligible), 2) as rating,
       count(*) filter (where rating_eligible)::int as rated_sessions,
       case when sum(fixtures_played) > 0 then round(100.0 * sum(wins) / sum(fixtures_played), 1) else 0 end as win_pct,
       max(played_at) as last_played_at
from public.session_player_statistics
group by user_id;

create or replace view public.v_group_stats with (security_invoker = true) as
select group_id, user_id,
       count(*)::int as sessions,
       sum(fixtures_played)::int as fixtures,
       sum(wins)::int as wins, sum(draws)::int as draws, sum(losses)::int as losses,
       sum(goals)::int as goals, sum(assists)::int as assists,
       count(*) filter (where motm)::int as motm,
       round(avg(rating_avg) filter (where rating_eligible), 2) as rating,
       count(*) filter (where rating_eligible)::int as rated_sessions,
       case when sum(fixtures_played) > 0 then round(100.0 * sum(wins) / sum(fixtures_played), 1) else 0 end as win_pct
from public.session_player_statistics
where group_id is not null
group by group_id, user_id;

-- ---------------------------------------------------------------------------
-- Statistic computation (idempotent; doubles as the reconciliation tool)
-- ---------------------------------------------------------------------------
create or replace function public.compute_session_statistics(p_session uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v public.sessions; v_participants int; v_threshold int; v_n int;
begin
  select * into v from public.sessions where id = p_session;
  delete from public.session_player_statistics where session_id = p_session;
  if v.status <> 'finalised' then return 0; end if;

  select count(*) into v_participants from public.session_attendance where session_id = p_session and verification = 'verified';
  v_threshold := public.min_ratings_required(v_participants, (select rating_min_votes from public.group_settings where group_id = v.group_id));

  insert into public.session_player_statistics (
    session_id, user_id, group_id, season_id, played_at, fixtures_played, wins, draws, losses, goals, assists,
    goals_for, goals_against, rating_avg, rating_count, rating_eligible, motm, motm_shared
  )
  select p_session, a.user_id, v.group_id, v.season_id, v.starts_at,
         coalesce(fx.played, 0), coalesce(fx.wins, 0), coalesce(fx.draws, 0), coalesce(fx.losses, 0),
         coalesce(g.goals, 0), coalesce(g.assists, 0), coalesce(fx.gf, 0), coalesce(fx.ga, 0),
         r.avg_score, coalesce(r.n, 0), coalesce(r.n, 0) >= v_threshold,
         m.user_id is not null, coalesce(m.shared, false)
  from public.session_attendance a
  left join lateral (
    select count(*)::int played,
           count(*) filter (where ft.score > opp.score)::int wins,
           count(*) filter (where ft.score = opp.score)::int draws,
           count(*) filter (where ft.score < opp.score)::int losses,
           sum(ft.score)::int gf, sum(opp.score)::int ga
      from public.team_players tp
      join public.fixtures f on f.id = tp.fixture_id and f.played and f.session_id = p_session
      join public.fixture_teams ft on ft.id = tp.fixture_team_id
      join public.fixture_teams opp on opp.fixture_id = f.id and opp.side <> ft.side
     where tp.user_id = a.user_id
  ) fx on true
  left join lateral (
    select sum(pg.goals)::int goals, sum(pg.assists)::int assists from public.player_goals pg where pg.session_id = p_session and pg.user_id = a.user_id
  ) g on true
  left join lateral (
    -- only ratings between verified participants are valid
    select round(avg(pr.score)::numeric, 2) avg_score, count(*)::int n
      from public.player_ratings pr
      join public.session_attendance ra on ra.session_id = p_session and ra.user_id = pr.rater_id and ra.verification = 'verified'
     where pr.session_id = p_session and pr.ratee_id = a.user_id
  ) r on true
  left join lateral (
    select ma.user_id, bool_or(ma.shared) shared from public.motm_awards ma where ma.session_id = p_session and ma.user_id = a.user_id group by ma.user_id
  ) m on true
  where a.session_id = p_session and a.verification = 'verified';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Fixture-level streaks for one player, optionally within a group.
create or replace function public.player_streaks(p_user uuid, p_group uuid default null, p_season uuid default null)
returns table (current_win_streak int, best_win_streak int, current_unbeaten int, best_unbeaten int)
language plpgsql stable security definer set search_path = public as $$
declare r record; cw int := 0; bw int := 0; cu int := 0; bu int := 0;
begin
  for r in
    select result from public.v_player_fixture_results
     where user_id = p_user and (p_group is null or group_id = p_group) and (p_season is null or season_id = p_season)
     order by played_at, fixture_number
  loop
    if r.result = 'W' then cw := cw + 1; else cw := 0; end if;
    if r.result <> 'L' then cu := cu + 1; else cu := 0; end if;
    bw := greatest(bw, cw); bu := greatest(bu, cu);
  end loop;
  return query select cw, bw, cu, bu;
end $$;

create or replace function public.award_achievements(p_user uuid, p_session uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare c record; s record; v_code text; v_new int := 0; v_name text;
begin
  select * into c from public.v_career_stats where user_id = p_user;
  if c.user_id is null then return 0; end if;
  select * into s from public.player_streaks(p_user);
  for v_code in
    select code from (values
      ('first_match', c.sessions >= 1),
      ('first_goal', c.goals >= 1),
      ('first_motm', c.motm >= 1),
      ('hat_trick', exists (select 1 from public.session_player_statistics where user_id = p_user and goals >= 3)),
      ('motm_10', c.motm >= 10),
      ('apps_50', c.sessions >= 50),
      ('goals_100', c.goals >= 100),
      ('win_streak_5', s.best_win_streak >= 5),
      ('unbeaten_10', s.best_unbeaten >= 10),
      ('season_champion', exists (select 1 from public.season_awards where user_id = p_user and award = 'player_of_season'))
    ) t(code, ok) where ok
  loop
    insert into public.player_achievements (user_id, achievement_code, session_id) values (p_user, v_code, p_session)
    on conflict (user_id, achievement_code) do nothing;
    if found then
      v_new := v_new + 1;
      select name into v_name from public.achievements where code = v_code;
      perform public.notify(p_user, 'achievement_unlocked', 'Achievement unlocked: ' || v_name, (select description from public.achievements where code = v_code),
        jsonb_build_object('achievement', v_code));
      perform public.post_activity(p_user, 'achievement', jsonb_build_object('code', v_code, 'name', v_name),
        (select group_id from public.sessions where id = p_session), p_session);
    end if;
  end loop;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Finalisation
-- ---------------------------------------------------------------------------
create or replace function public.decide_motm(p_session uuid, p_fixture uuid, p_tiebreak uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_max int; v_leaders uuid[];
begin
  select max(cnt) into v_max from (
    select count(*) cnt from public.motm_votes mv
      join public.session_attendance a on a.session_id = mv.session_id and a.user_id = mv.voter_id and a.verification = 'verified'
     where mv.session_id = p_session and mv.fixture_id is not distinct from p_fixture group by mv.nominee_id) x;
  if v_max is null then return; end if; -- no votes: no award (never invent a winner)
  select array_agg(nominee_id) into v_leaders from (
    select mv.nominee_id, count(*) cnt from public.motm_votes mv
      join public.session_attendance a on a.session_id = mv.session_id and a.user_id = mv.voter_id and a.verification = 'verified'
     where mv.session_id = p_session and mv.fixture_id is not distinct from p_fixture group by mv.nominee_id) x where cnt = v_max;
  if array_length(v_leaders, 1) > 1 and p_tiebreak is not null and p_tiebreak = any (v_leaders) then
    insert into public.motm_awards (session_id, fixture_id, user_id, votes, shared, decided_by_host) values (p_session, p_fixture, p_tiebreak, v_max, false, true);
    perform public.log_audit('motm.tiebreak', 'session', p_session, jsonb_build_object('winner', p_tiebreak, 'tied', v_leaders));
  else
    insert into public.motm_awards (session_id, fixture_id, user_id, votes, shared)
    select p_session, p_fixture, u, v_max, array_length(v_leaders, 1) > 1 from unnest(v_leaders) u;
  end if;
end $$;

create or replace function public.finalise_session_internal(p_session uuid, p_tiebreak uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions; v_season uuid; v_fixture record; v_user record; v_score text; v_motm record; v_count int;
begin
  select * into v from public.sessions where id = p_session for update;
  if v.status <> 'completed' then perform public.raise_app_error('locked', 'Only completed sessions can be finalised.'); end if;
  if exists (select 1 from public.goal_submissions where session_id = p_session and status in ('pending', 'clarification_requested')) then
    perform public.raise_app_error('pending_claims', 'Resolve all outstanding goal submissions before finalising.');
  end if;

  select id into v_season from public.seasons
   where group_id = v.group_id and v.starts_at::date between starts_on and ends_on order by starts_on desc limit 1;
  update public.sessions set status = 'finalised', finalised_at = now(), season_id = coalesce(v_season, season_id),
         voting_closes_at = least(coalesce(voting_closes_at, now()), now())
   where id = p_session;

  delete from public.motm_awards where session_id = p_session;
  if v.motm_mode = 'fixture' then
    for v_fixture in select id from public.fixtures where session_id = p_session order by number loop
      perform public.decide_motm(p_session, v_fixture.id, p_tiebreak, p_actor);
    end loop;
  else
    perform public.decide_motm(p_session, null, p_tiebreak, p_actor);
  end if;

  perform public.compute_session_statistics(p_session);

  -- feed + notifications
  select string_agg(fa.score || '–' || fb.score, ', ' order by f.number) into v_score
    from public.fixtures f join public.fixture_teams fa on fa.fixture_id = f.id and fa.side = 'A' join public.fixture_teams fb on fb.fixture_id = f.id and fb.side = 'B'
   where f.session_id = p_session;
  perform public.post_activity(v.host_id, 'session_result',
    jsonb_build_object('session_name', v.name, 'score', v_score, 'format_size', v.format_size), v.group_id, p_session);
  for v_motm in select ma.user_id, p.display_name, ma.shared, ma.votes from public.motm_awards ma join public.profiles p on p.id = ma.user_id where ma.session_id = p_session loop
    perform public.post_activity(v_motm.user_id, 'motm', jsonb_build_object('session_name', v.name, 'votes', v_motm.votes, 'shared', v_motm.shared), v.group_id, p_session);
  end loop;
  for v_user in select user_id, goals from public.session_player_statistics where session_id = p_session and goals >= 3 loop
    perform public.post_activity(v_user.user_id, 'hat_trick', jsonb_build_object('session_name', v.name, 'goals', v_user.goals), v.group_id, p_session);
  end loop;
  if v.group_id is not null then
    select count(*) into v_count from public.sessions where group_id = v.group_id and status = 'finalised';
    if v_count in (10, 25, 50, 100, 250, 500) then
      perform public.post_activity(null, 'group_milestone', jsonb_build_object('sessions', v_count, 'group_name', (select name from public.groups where id = v.group_id)), v.group_id);
    end if;
  end if;

  for v_user in select user_id from public.session_player_statistics where session_id = p_session loop
    perform public.notify(v_user.user_id, 'session_finalised', 'Results are in: ' || v.name,
      coalesce((select 'MOTM: ' || string_agg(p.display_name, ' & ') from public.motm_awards ma join public.profiles p on p.id = ma.user_id where ma.session_id = p_session and ma.fixture_id is null), 'Your stats have been updated.'),
      jsonb_build_object('session_id', p_session));
    perform public.award_achievements(v_user.user_id, p_session);
  end loop;

  perform public.log_audit('session.finalised', 'session', p_session, jsonb_build_object('actor', p_actor, 'tiebreak', p_tiebreak));
end $$;
revoke execute on function public.finalise_session_internal(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.finalise_session(p_session uuid, p_motm_tiebreak uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_session_manager(p_session);
  perform public.finalise_session_internal(p_session, p_motm_tiebreak, auth.uid());
end $$;

-- Preview of MOTM standings for the host (only after voting closes, to keep votes anonymous).
create or replace function public.get_motm_tally(p_session uuid)
returns table (user_id uuid, fixture_id uuid, votes int) language plpgsql stable security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session);
begin
  if not public.is_session_manager(p_session, auth.uid()) then perform public.raise_app_error('forbidden', 'Only the host can see the tally.'); end if;
  if v.status = 'completed' and v.voting_closes_at > now() then
    perform public.raise_app_error('voting_open', 'The tally is revealed when voting closes.');
  end if;
  return query select mv.nominee_id, mv.fixture_id, count(*)::int from public.motm_votes mv where mv.session_id = p_session group by mv.nominee_id, mv.fixture_id order by 3 desc;
end $$;

-- Close voting early (host), e.g. when everyone has voted.
create or replace function public.close_voting(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.status <> 'completed' then perform public.raise_app_error('locked', 'Voting is not open.'); end if;
  update public.sessions set voting_closes_at = now() where id = p_session;
  perform public.log_audit('voting.closed', 'session', p_session);
end $$;

-- Audited post-finalisation corrections (score / attendance), then recompute.
create or replace function public.correct_session(p_session uuid, p_kind text, p_data jsonb, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_before jsonb; v_user record;
begin
  if v.status <> 'finalised' then perform public.raise_app_error('invalid', 'Corrections apply to finalised sessions only.'); end if;
  if coalesce(trim(p_reason), '') = '' then perform public.raise_app_error('reason_required', 'Explain the correction.'); end if;
  if p_kind = 'score' then
    select jsonb_agg(jsonb_build_object('side', side, 'score', score)) into v_before from public.fixture_teams where fixture_id = (p_data ->> 'fixture_id')::uuid;
    if public.session_of_fixture((p_data ->> 'fixture_id')::uuid) <> p_session then perform public.raise_app_error('invalid', 'Fixture mismatch.'); end if;
    update public.fixture_teams set score = case side when 'A' then (p_data ->> 'score_a')::int else (p_data ->> 'score_b')::int end
     where fixture_id = (p_data ->> 'fixture_id')::uuid;
  elsif p_kind = 'attendance' then
    select to_jsonb(a) into v_before from public.session_attendance a where session_id = p_session and user_id = (p_data ->> 'user_id')::uuid;
    update public.session_attendance set verification = (p_data ->> 'verification')::public.verification_status,
           status = case when p_data ->> 'verification' = 'verified' then 'confirmed' else status end, verified_by = auth.uid(), verified_at = now()
     where session_id = p_session and user_id = (p_data ->> 'user_id')::uuid;
    if p_data ->> 'verification' = 'absent' then
      delete from public.team_players tp using public.fixtures f where tp.fixture_id = f.id and f.session_id = p_session and tp.user_id = (p_data ->> 'user_id')::uuid;
      delete from public.player_goals where session_id = p_session and user_id = (p_data ->> 'user_id')::uuid;
    end if;
  else
    perform public.raise_app_error('invalid', 'Unknown correction type.');
  end if;
  perform public.compute_session_statistics(p_session);
  for v_user in select user_id from public.session_player_statistics where session_id = p_session loop
    perform public.award_achievements(v_user.user_id, p_session);
  end loop;
  perform public.log_audit('session.corrected', 'session', p_session, jsonb_build_object('kind', p_kind, 'data', p_data, 'before', v_before, 'reason', p_reason));
end $$;

-- Recompute everything for a session (reconciliation tool for admins/ops).
create or replace function public.reconcile_session(p_session uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.require_session_manager(p_session);
  v_n := public.compute_session_statistics(p_session);
  perform public.log_audit('session.reconciled', 'session', p_session, jsonb_build_object('rows', v_n));
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles & career
-- ---------------------------------------------------------------------------
create or replace function public.get_player_profile(p_user uuid, p_group uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_viewer uuid := public.require_user();
  v_profile public.profiles;
  v_can boolean;
  v_stats jsonb;
  v_streaks record;
begin
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null or public.is_blocked_between(p_user, v_viewer) then
    perform public.raise_app_error('not_found', 'Player not found.');
  end if;
  if p_group is not null and not public.can_view_group(p_group, v_viewer) then
    perform public.raise_app_error('forbidden', 'Insufficient permissions.');
  end if;
  v_can := public.can_view_profile_details(p_user, v_viewer) or (p_group is not null and public.is_group_member(p_group, v_viewer) and public.is_group_member(p_group, p_user));

  if v_can then
    select * into v_streaks from public.player_streaks(p_user, p_group);
    select jsonb_build_object(
      'sessions', count(*), 'fixtures', coalesce(sum(fixtures_played), 0),
      'wins', coalesce(sum(wins), 0), 'draws', coalesce(sum(draws), 0), 'losses', coalesce(sum(losses), 0),
      'goals', coalesce(sum(goals), 0), 'assists', coalesce(sum(assists), 0),
      'motm', count(*) filter (where motm),
      'rating', round(avg(rating_avg) filter (where rating_eligible), 1),
      'rated_sessions', count(*) filter (where rating_eligible),
      'highest_rating', max(rating_avg) filter (where rating_eligible),
      'win_pct', case when sum(fixtures_played) > 0 then round(100.0 * sum(wins) / sum(fixtures_played), 1) else 0 end,
      'current_win_streak', v_streaks.current_win_streak, 'best_win_streak', v_streaks.best_win_streak,
      'current_unbeaten', v_streaks.current_unbeaten, 'best_unbeaten', v_streaks.best_unbeaten
    ) into v_stats
    from public.session_player_statistics where user_id = p_user and (p_group is null or group_id = p_group);
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object('id', v_profile.id, 'username', v_profile.username, 'display_name', v_profile.display_name,
      'avatar_url', v_profile.avatar_url, 'position', v_profile.position, 'created_at', v_profile.created_at,
      'bio', case when v_can then v_profile.bio end),
    'can_view_stats', v_can,
    'is_self', p_user = v_viewer,
    'is_friend', public.are_friends(p_user, v_viewer),
    'friend_request', (select jsonb_build_object('id', id, 'outgoing', sender_id = v_viewer) from public.friend_requests
                        where status = 'pending' and ((sender_id = v_viewer and receiver_id = p_user) or (sender_id = p_user and receiver_id = v_viewer)) limit 1),
    'friends_count', (select count(*) from public.friendships where user_a = p_user or user_b = p_user),
    'stats', v_stats,
    'form', case when v_can then (
      select coalesce(jsonb_agg(jsonb_build_object('session_id', session_id, 'rating', rating_avg, 'played_at', played_at) order by played_at), '[]'::jsonb)
      from (select session_id, rating_avg, played_at from public.session_player_statistics
             where user_id = p_user and rating_eligible and (p_group is null or group_id = p_group) order by played_at desc limit 5) f) end,
    'rating_history', case when v_can then (
      select coalesce(jsonb_agg(jsonb_build_object('session_id', session_id, 'rating', rating_avg, 'played_at', played_at) order by played_at), '[]'::jsonb)
      from (select session_id, rating_avg, played_at from public.session_player_statistics
             where user_id = p_user and rating_eligible and (p_group is null or group_id = p_group) order by played_at desc limit 20) f) end,
    'recent_results', case when v_can then (
      select coalesce(jsonb_agg(r order by r.played_at desc), '[]'::jsonb) from (
        select sps.session_id, s.name, sps.played_at, sps.wins, sps.draws, sps.losses, sps.goals, sps.rating_avg, sps.rating_eligible, sps.motm
          from public.session_player_statistics sps join public.sessions s on s.id = sps.session_id
         where sps.user_id = p_user and (p_group is null or sps.group_id = p_group) order by sps.played_at desc limit 10) r) end,
    'achievements', case when v_can then (
      select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'icon', a.icon, 'description', a.description, 'unlocked_at', pa.unlocked_at) order by a.sort_order), '[]'::jsonb)
        from public.player_achievements pa join public.achievements a on a.code = pa.achievement_code where pa.user_id = p_user) end,
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'logo_url', g.logo_url, 'role', gm.role) order by g.name), '[]'::jsonb)
        from public.group_members gm join public.groups g on g.id = gm.group_id
       where gm.user_id = p_user and public.can_view_group(g.id, v_viewer)),
    'teammates', case when v_can then public.get_frequent_teammates(p_user, 5) end
  );
end $$;

create or replace function public.get_frequent_teammates(p_user uuid, p_limit int default 5)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.games desc), '[]'::jsonb) from (
    select p.id as user_id, p.username, p.display_name, p.avatar_url, count(*)::int as games,
           count(*) filter (where me.result = 'W')::int as wins
      from public.v_player_fixture_results me
      join public.team_players tp on tp.fixture_id = me.fixture_id and tp.user_id <> me.user_id
      join public.fixture_teams ft on ft.id = tp.fixture_team_id and ft.side = me.side
      join public.profiles p on p.id = tp.user_id
     where me.user_id = p_user and not public.is_blocked_between(p.id, auth.uid())
     group by p.id order by count(*) desc limit p_limit) t;
$$;

create or replace function public.get_head_to_head(p_a uuid, p_b uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user(); v_res jsonb;
begin
  if not (public.can_view_profile_details(p_a, v_viewer) and public.can_view_profile_details(p_b, v_viewer)) then
    perform public.raise_app_error('forbidden', 'One of these players keeps their stats private.');
  end if;
  with opp as (
    select a.fixture_id, a.session_id, a.played_at, a.result as a_result, a.goals_for as a_score, a.goals_against as b_score
      from public.v_player_fixture_results a
      join public.v_player_fixture_results b on b.fixture_id = a.fixture_id and b.user_id = p_b and b.side <> a.side
     where a.user_id = p_a
  ), mates as (
    select a.result from public.v_player_fixture_results a
      join public.v_player_fixture_results b on b.fixture_id = a.fixture_id and b.user_id = p_b and b.side = a.side
     where a.user_id = p_a
  )
  select jsonb_build_object(
    'a', (select to_jsonb(c) from public.v_career_stats c where user_id = p_a),
    'b', (select to_jsonb(c) from public.v_career_stats c where user_id = p_b),
    'a_form', (select round(avg(rating_avg), 1) from (select rating_avg from public.session_player_statistics where user_id = p_a and rating_eligible order by played_at desc limit 5) x),
    'b_form', (select round(avg(rating_avg), 1) from (select rating_avg from public.session_player_statistics where user_id = p_b and rating_eligible order by played_at desc limit 5) x),
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

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_rows(
  p_scope text, p_group uuid, p_season uuid, p_from timestamptz, p_to timestamptz, p_viewer uuid
) returns setof public.session_player_statistics language sql stable security definer set search_path = public as $$
  select sps.* from public.session_player_statistics sps
  where (p_season is null or sps.season_id = p_season)
    and (p_from is null or sps.played_at >= p_from)
    and (p_to is null or sps.played_at < p_to)
    and case p_scope
      when 'group' then sps.group_id = p_group
      when 'friends' then (sps.user_id = p_viewer or public.are_friends(sps.user_id, p_viewer)) and public.can_view_profile_details(sps.user_id, p_viewer)
      else exists (select 1 from public.user_preferences up where up.user_id = sps.user_id and up.profile_visibility = 'public' and up.show_stats)
           and not public.is_blocked_between(sps.user_id, p_viewer)
    end;
$$;

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
  value numeric, appearances int, is_me boolean, total int
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
    select a.user_id, a.apps,
      case p_category
        when 'goals' then a.goals
        when 'assists' then a.assists
        when 'motm' then a.motm
        when 'appearances' then a.apps::numeric
        when 'wins' then a.wins
        when 'win_pct' then case when a.apps >= v_min and a.fixtures > 0 then round(100.0 * a.wins / a.fixtures, 1) end
        when 'rating' then case when a.rated >= 3 then round(a.rating, 2) end
        when 'form' then case when f.n >= 3 then round(f.form, 2) end
        when 'improved' then case when f.n >= 6 then round(f.recent_half - f.early_half, 2) end
        when 'streak' then (select s.best_win_streak from public.player_streaks(a.user_id, case when p_scope = 'group' then p_group end, p_season) s)::numeric
      end as value
      from agg a left join form f on f.user_id = a.user_id
  ), ranked as (
    select v.*, (rank() over (order by v.value desc, v.apps asc))::int rnk, (count(*) over ())::int cnt
      from vals v where v.value is not null and (v.value > 0 or p_category in ('improved'))
  )
  select r.rnk, r.user_id, p.username, p.display_name, p.avatar_url, r.value, r.apps, r.user_id = v_viewer, r.cnt
    from ranked r join public.profiles p on p.id = r.user_id
   order by r.rnk, p.username
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Group record book
-- ---------------------------------------------------------------------------
create or replace function public.get_group_records(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if not public.can_view_group(p_group, public.require_user()) then perform public.raise_app_error('forbidden', 'Insufficient permissions.'); end if;
  with fx as (
    select s.id session_id, s.name, s.starts_at, f.id fixture_id, a.score sa, b.score sb
      from public.sessions s join public.fixtures f on f.session_id = s.id and f.played
      join public.fixture_teams a on a.fixture_id = f.id and a.side = 'A'
      join public.fixture_teams b on b.fixture_id = f.id and b.side = 'B'
     where s.group_id = p_group and s.status = 'finalised'
  ), holder as (
    select p.id, p.username, p.display_name, p.avatar_url from public.profiles p
  ), streaks as (
    select gm.user_id, (public.player_streaks(gm.user_id, p_group)).* from public.group_members gm where gm.group_id = p_group
  )
  select jsonb_build_object(
    'highest_scoring_fixture', (select jsonb_build_object('session_id', session_id, 'name', name, 'date', starts_at, 'score', sa || '–' || sb, 'value', sa + sb) from fx order by sa + sb desc, starts_at limit 1),
    'biggest_victory', (select jsonb_build_object('session_id', session_id, 'name', name, 'date', starts_at, 'score', sa || '–' || sb, 'value', abs(sa - sb)) from fx order by abs(sa - sb) desc, starts_at limit 1),
    'most_goals_in_session', (select jsonb_build_object('user', to_jsonb(h), 'value', sps.goals, 'session_id', sps.session_id, 'date', sps.played_at)
        from public.session_player_statistics sps join holder h on h.id = sps.user_id where sps.group_id = p_group and sps.goals > 0 order by sps.goals desc, sps.played_at limit 1),
    'highest_session_rating', (select jsonb_build_object('user', to_jsonb(h), 'value', sps.rating_avg, 'session_id', sps.session_id, 'date', sps.played_at)
        from public.session_player_statistics sps join holder h on h.id = sps.user_id where sps.group_id = p_group and sps.rating_eligible order by sps.rating_avg desc, sps.played_at limit 1),
    'most_consecutive_wins', (select jsonb_build_object('user', to_jsonb(h), 'value', st.best_win_streak) from streaks st join holder h on h.id = st.user_id where st.best_win_streak > 0 order by st.best_win_streak desc limit 1),
    'longest_unbeaten', (select jsonb_build_object('user', to_jsonb(h), 'value', st.best_unbeaten) from streaks st join holder h on h.id = st.user_id where st.best_unbeaten > 0 order by st.best_unbeaten desc limit 1),
    'most_motm_in_season', (select jsonb_build_object('user', to_jsonb(h), 'value', x.n, 'season', se.name) from (
        select user_id, season_id, count(*) n from public.session_player_statistics where group_id = p_group and motm and season_id is not null group by user_id, season_id) x
        join holder h on h.id = x.user_id join public.seasons se on se.id = x.season_id order by x.n desc limit 1),
    'top_scorer', (select jsonb_build_object('user', to_jsonb(h), 'value', x.n) from (
        select user_id, sum(goals) n from public.session_player_statistics where group_id = p_group group by user_id) x join holder h on h.id = x.user_id where x.n > 0 order by x.n desc limit 1),
    'most_appearances', (select jsonb_build_object('user', to_jsonb(h), 'value', x.n) from (
        select user_id, count(*) n from public.session_player_statistics where group_id = p_group group by user_id) x join holder h on h.id = x.user_id order by x.n desc limit 1),
    'sessions_played', (select count(*) from public.sessions where group_id = p_group and status = 'finalised'),
    'goals_scored', (select coalesce(sum(sa + sb), 0) from fx)
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------
-- MATCHDAY Wrapped (monthly / annual review)
-- ---------------------------------------------------------------------------
create or replace function public.get_wrapped(p_from timestamptz, p_to timestamptz, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := coalesce(p_user, public.require_user()); v_res jsonb; v_best_streak int := 0; cw int := 0; r record;
begin
  if not public.can_view_profile_details(v_user, auth.uid()) then perform public.raise_app_error('forbidden', 'This player''s stats are private.'); end if;
  for r in select result from public.v_player_fixture_results where user_id = v_user and played_at >= p_from and played_at < p_to order by played_at, fixture_number loop
    if r.result = 'W' then cw := cw + 1; else cw := 0; end if;
    v_best_streak := greatest(v_best_streak, cw);
  end loop;
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sessions', count(*), 'fixtures', coalesce(sum(fixtures_played), 0),
    'goals', coalesce(sum(goals), 0), 'assists', coalesce(sum(assists), 0),
    'wins', coalesce(sum(wins), 0), 'draws', coalesce(sum(draws), 0), 'losses', coalesce(sum(losses), 0),
    'rating', round(avg(rating_avg) filter (where rating_eligible), 1),
    'motm', count(*) filter (where motm),
    'best_win_streak', v_best_streak,
    'best_performance', (select jsonb_build_object('session_id', x.session_id, 'name', s.name, 'date', x.played_at, 'rating', x.rating_avg, 'goals', x.goals)
        from public.session_player_statistics x join public.sessions s on s.id = x.session_id
       where x.user_id = v_user and x.played_at >= p_from and x.played_at < p_to
       order by x.rating_eligible desc, x.rating_avg desc nulls last, x.goals desc limit 1),
    'teammates', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select p.username, p.display_name, p.avatar_url, count(*) games
          from public.v_player_fixture_results me
          join public.team_players tp on tp.fixture_id = me.fixture_id and tp.user_id <> me.user_id
          join public.fixture_teams ft on ft.id = tp.fixture_team_id and ft.side = me.side
          join public.profiles p on p.id = tp.user_id
         where me.user_id = v_user and me.played_at >= p_from and me.played_at < p_to
         group by p.id order by count(*) desc limit 3) t)
  ) into v_res
  from public.session_player_statistics where user_id = v_user and played_at >= p_from and played_at < p_to;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------
-- Team balancing inputs for the line-up builder
-- ---------------------------------------------------------------------------
create or replace function public.get_player_strengths(p_session uuid)
returns table (
  user_id uuid, username citext, display_name text, avatar_url text, "position" public.player_position,
  group_rating numeric, career_rating numeric, form numeric, games int, gk_games int, win_pct numeric
) language plpgsql stable security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session);
begin
  if not public.can_view_session(p_session, public.require_user()) then perform public.raise_app_error('forbidden', 'Insufficient permissions.'); end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_url, p.position,
         (select round(avg(s.rating_avg), 2) from public.session_player_statistics s where s.user_id = p.id and s.group_id = v.group_id and s.rating_eligible and v.group_id is not null),
         (select round(avg(s.rating_avg), 2) from public.session_player_statistics s where s.user_id = p.id and s.rating_eligible),
         (select round(avg(x.rating_avg), 2) from (select s.rating_avg from public.session_player_statistics s where s.user_id = p.id and s.rating_eligible order by s.played_at desc limit 5) x),
         (select count(*)::int from public.session_player_statistics s where s.user_id = p.id),
         (select count(*)::int from public.team_players tp join public.fixtures f on f.id = tp.fixture_id join public.sessions s on s.id = f.session_id
           where tp.user_id = p.id and tp.is_goalkeeper and s.status = 'finalised'),
         (select case when sum(s.fixtures_played) > 0 then round(100.0 * sum(s.wins) / sum(s.fixtures_played), 1) end from public.session_player_statistics s where s.user_id = p.id)
    from public.session_attendance a join public.profiles p on p.id = a.user_id
   where a.session_id = p_session and a.status = 'confirmed' and a.verification <> 'absent';
end $$;

-- Pairs of players who were on the same team in the group's most recent sessions,
-- so the balancer can avoid repeating identical line-ups.
create or replace function public.get_recent_pairings(p_session uuid, p_sessions int default 3)
returns table (user_a uuid, user_b uuid, times int) language plpgsql stable security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session);
begin
  if not public.can_view_session(p_session, public.require_user()) then perform public.raise_app_error('forbidden', 'Insufficient permissions.'); end if;
  return query
  with recent as (
    select s.id from public.sessions s where s.group_id = v.group_id and v.group_id is not null and s.status = 'finalised' order by s.starts_at desc limit p_sessions
  )
  select least(x.user_id, y.user_id), greatest(x.user_id, y.user_id), count(*)::int
    from public.team_players x
    join public.team_players y on y.fixture_team_id = x.fixture_team_id and y.user_id > x.user_id
    join public.fixtures f on f.id = x.fixture_id
   where f.session_id in (select id from recent)
   group by 1, 2;
end $$;

-- ---------------------------------------------------------------------------
-- Home dashboard & pending tasks
-- ---------------------------------------------------------------------------
create or replace function public.get_pending_tasks()
returns table (kind text, session_id uuid, title text, subtitle text, due_at timestamptz, count int)
language sql stable security definer set search_path = public as $$
  -- invitations awaiting a response
  select 'rsvp', s.id, s.name, 'Are you playing?', s.starts_at, 1
    from public.session_invitations i join public.sessions s on s.id = i.session_id
   where i.user_id = auth.uid() and s.status = 'scheduled' and s.starts_at > now()
     and not exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = auth.uid())
  union all
  -- MOTM / ratings outstanding
  select 'vote', s.id, s.name, 'Vote for MOTM and rate players', s.voting_closes_at, 1
    from public.session_attendance a join public.sessions s on s.id = a.session_id
   where a.user_id = auth.uid() and a.verification = 'verified' and s.status = 'completed' and s.voting_closes_at > now()
     and (not exists (select 1 from public.motm_votes v where v.session_id = s.id and v.voter_id = auth.uid())
          or (select count(*) from public.player_ratings r where r.session_id = s.id and r.rater_id = auth.uid())
             < (select count(*) - 1 from public.session_attendance x where x.session_id = s.id and x.verification = 'verified'))
  union all
  -- goals not yet submitted
  select 'goals', s.id, s.name, 'Submit your goals', coalesce(s.voting_closes_at, s.completed_at + interval '2 days'), 1
    from public.session_attendance a join public.sessions s on s.id = a.session_id
   where a.user_id = auth.uid() and a.verification = 'verified' and s.status = 'completed'
     and not exists (select 1 from public.goal_submissions g where g.session_id = s.id and g.user_id = auth.uid() and g.status <> 'clarification_requested')
  union all
  -- payments due
  select 'payment', s.id, s.name, '£' || to_char(p.amount_pence / 100.0, 'FM990.00') || ' due', s.starts_at, 1
    from public.payments p join public.sessions s on s.id = p.session_id
   where p.payer_id = auth.uid() and p.status in ('unpaid', 'failed')
  union all
  -- host: approvals waiting
  select 'approve_goals', s.id, s.name, count(g.id) || ' goal claim(s) to review', s.voting_closes_at, count(g.id)::int
    from public.goal_submissions g join public.sessions s on s.id = g.session_id
   where g.status = 'pending' and g.user_id <> auth.uid() and public.can_review_submission(g.id, auth.uid())
   group by s.id
  union all
  -- host: sessions to complete or finalise
  select case when s.status = 'completed' then 'finalise' else 'complete' end, s.id, s.name,
         case when s.status = 'completed' then 'Finalise results' else 'Record the score' end, s.starts_at, 1
    from public.sessions s
   where public.is_session_manager(s.id, auth.uid())
     and ((s.status in ('scheduled', 'in_progress') and s.starts_at + make_interval(mins => s.duration_minutes) < now())
          or (s.status = 'completed' and s.voting_closes_at <= now()))
  order by 5 nulls last;
$$;

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
               'my_rank', (select l.rank from public.get_leaderboard('rating', 'group', g.id) l where l.user_id = v_uid limit 1),
               'leader', (select jsonb_build_object('display_name', l.display_name, 'value', l.value) from public.get_leaderboard('rating', 'group', g.id) l order by l.rank limit 1))
             order by g.name), '[]'::jsonb)
        from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = v_uid),
    'unread_notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null)
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
create or replace function public.finalise_season(p_season uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.seasons; v_min int; v_sessions int; v_award record; v_gname text;
begin
  select * into v_s from public.seasons where id = p_season for update;
  if v_s.id is null then perform public.raise_app_error('not_found', 'Season not found.'); end if;
  if auth.uid() is not null and not public.is_group_admin(v_s.group_id, auth.uid()) then
    perform public.raise_app_error('forbidden', 'Only group admins can finalise seasons.');
  end if;
  if v_s.status = 'completed' then perform public.raise_app_error('locked', 'This season has already been finalised.'); end if;
  if exists (select 1 from public.sessions where season_id = p_season and status = 'completed') then
    perform public.raise_app_error('pending_sessions', 'Finalise all completed sessions in this season first.');
  end if;

  select count(*) into v_sessions from public.sessions where season_id = p_season and status = 'finalised';
  v_min := greatest(1, least(coalesce((select leaderboard_min_appearances from public.group_settings where group_id = v_s.group_id), 5), ceil(v_sessions * 0.3)::int));

  delete from public.season_awards where season_id = p_season;
  with agg as (
    select user_id, count(*) apps, sum(goals) goals, sum(assists) assists, sum(wins) wins, sum(fixtures_played) fx,
           count(*) filter (where motm) motm, avg(rating_avg) filter (where rating_eligible) rating,
           count(*) filter (where rating_eligible) rated
      from public.session_player_statistics where season_id = p_season group by user_id
  ), halves as (
    select user_id,
           avg(rating_avg) filter (where rn > n - n / 2) recent, avg(rating_avg) filter (where rn <= n / 2) early, max(n) n
      from (select user_id, rating_avg, row_number() over (partition by user_id order by played_at) rn, count(*) over (partition by user_id) n
              from public.session_player_statistics where season_id = p_season and rating_eligible) x group by user_id
  ), candidates as (
    select 'player_of_season' award, user_id, round(rating, 2) value, apps from agg where apps >= v_min and rated >= 1
    union all select 'golden_boot', user_id, goals, apps from agg where goals > 0
    union all select 'most_motm', user_id, motm, apps from agg where motm > 0
    union all select 'highest_rating', user_id, round(rating, 2), apps from agg where apps >= v_min and rated >= 1
    union all select 'most_appearances', user_id, apps, apps from agg
    union all select 'most_wins', user_id, wins, apps from agg where wins > 0
    union all select 'best_win_pct', user_id, round(100.0 * wins / nullif(fx, 0), 1), apps from agg where apps >= v_min and fx > 0
    union all select 'most_improved', h.user_id, round(h.recent - h.early, 2), a.apps from halves h join agg a using (user_id) where h.n >= 4 and h.recent > h.early
    union all select 'most_assists', user_id, assists, apps from agg where assists > 0
  ), winners as (
    select c.*, rank() over (partition by award order by value desc) rk from candidates c where value is not null
  )
  insert into public.season_awards (season_id, award, user_id, value, appearances)
  select p_season, award, user_id, value, apps from winners where rk = 1;

  update public.seasons set status = 'completed', finalised_at = now() where id = p_season;
  select name into v_gname from public.groups where id = v_s.group_id;
  for v_award in select sa.user_id, sa.award from public.season_awards sa where sa.season_id = p_season loop
    perform public.notify(v_award.user_id, 'season_award', 'Season award: ' || replace(initcap(replace(v_award.award, '_', ' ')), 'Pct', '%'),
      'You won an award for ' || v_s.name || ' in ' || v_gname || '!', jsonb_build_object('group_id', v_s.group_id, 'season_id', p_season));
    perform public.post_activity(v_award.user_id, 'season_award', jsonb_build_object('award', v_award.award, 'season_name', v_s.name, 'group_name', v_gname), v_s.group_id);
    perform public.award_achievements(v_award.user_id, null);
  end loop;
  perform public.log_audit('season.finalised', 'season', p_season);
end $$;

-- ---------------------------------------------------------------------------
-- Deadline processor (scheduled every 15 minutes via pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.process_session_deadlines()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_finalised int := 0; v_reminders int := 0; v_created int := 0; v_next date;
begin
  -- 1. Kick-off reminders 24h ahead (once per player per session)
  for r in
    select s.id, s.name, s.starts_at, a.user_id from public.sessions s
      join public.session_attendance a on a.session_id = s.id and a.status = 'confirmed'
     where s.status = 'scheduled' and s.starts_at between now() and now() + interval '24 hours'
       and not exists (select 1 from public.notifications n where n.user_id = a.user_id and n.type = 'session_reminder' and n.data ->> 'session_id' = s.id::text)
  loop
    perform public.notify(r.user_id, 'session_reminder', 'Matchday tomorrow: ' || r.name,
      'Kick-off ' || to_char(r.starts_at at time zone 'Europe/London', 'Dy HH24:MI') || '. Check the line-ups.', jsonb_build_object('session_id', r.id));
    v_reminders := v_reminders + 1;
  end loop;

  -- 2. Voting closes within 12h: remind those who haven't voted (once)
  for r in
    select s.id, s.name, a.user_id from public.sessions s
      join public.session_attendance a on a.session_id = s.id and a.verification = 'verified'
     where s.status = 'completed' and s.voting_closes_at between now() and now() + interval '12 hours'
       and not exists (select 1 from public.motm_votes v where v.session_id = s.id and v.voter_id = a.user_id)
       and not exists (select 1 from public.notifications n where n.user_id = a.user_id and n.type = 'voting_reminder' and n.data ->> 'session_id' = s.id::text)
  loop
    perform public.notify(r.user_id, 'voting_reminder', 'Last call to vote', 'Voting for ' || r.name || ' closes soon.', jsonb_build_object('session_id', r.id));
    v_reminders := v_reminders + 1;
  end loop;

  -- 3. Goal submission reminder 6h after completion (once)
  for r in
    select s.id, s.name, a.user_id from public.sessions s
      join public.session_attendance a on a.session_id = s.id and a.verification = 'verified'
     where s.status = 'completed' and s.completed_at < now() - interval '6 hours'
       and not exists (select 1 from public.goal_submissions g where g.session_id = s.id and g.user_id = a.user_id)
       and not exists (select 1 from public.notifications n where n.user_id = a.user_id and n.type = 'goals_reminder' and n.data ->> 'session_id' = s.id::text)
  loop
    perform public.notify(r.user_id, 'goals_reminder', 'Forgot your goals?', 'Add your tally for ' || r.name || ' before results are finalised.', jsonb_build_object('session_id', r.id));
    v_reminders := v_reminders + 1;
  end loop;

  -- 4. Auto-finalise once voting has closed and no claims are pending; otherwise nudge the host once
  for r in select s.* from public.sessions s where s.status = 'completed' and s.voting_closes_at < now() loop
    if exists (select 1 from public.goal_submissions g where g.session_id = r.id and g.status in ('pending', 'clarification_requested')) then
      if not exists (select 1 from public.notifications n where n.user_id = r.host_id and n.type = 'finalise_blocked' and n.data ->> 'session_id' = r.id::text) then
        perform public.notify(r.host_id, 'finalise_blocked', 'Approve goals to finalise', 'Voting has closed for ' || r.name || '. Review the outstanding goal claims to publish results.',
          jsonb_build_object('session_id', r.id));
      end if;
    else
      perform public.finalise_session_internal(r.id, null, null);
      v_finalised := v_finalised + 1;
    end if;
  end loop;

  -- 5. Recurring templates: create the next occurrence ~7 days ahead
  for r in select t.* from public.session_templates t where t.auto_schedule and t.recurrence <> 'none' loop
    select (max(s.starts_at) at time zone 'Europe/London')::date into v_next from public.sessions s where s.template_id = r.id and s.status <> 'cancelled';
    if v_next is null then continue; end if;
    v_next := v_next + case r.recurrence when 'weekly' then 7 when 'fortnightly' then 14 else 0 end;
    if r.recurrence = 'monthly' then v_next := (v_next + interval '1 month')::date; end if;
    if v_next <= (now() at time zone 'Europe/London')::date + 7 then
      perform public.create_session_from_template(r.id, v_next, r.owner_id);
      perform set_config('request.jwt.claims', '', true);
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('finalised', v_finalised, 'reminders', v_reminders, 'created', v_created);
end $$;
revoke execute on function public.process_session_deadlines() from public, anon, authenticated;
