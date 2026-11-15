-- Fair ratings. A player's match rating is no longer a plain average of their teammates' scores:
--  1. Outliers: with 4+ ratings, a score more than 3 points from the middle (median) score is left out
--     (the mate who always gives 10, or the rival who gives 1).
--  2. Generous / harsh raters: someone who rated everyone well above (or below) the typical score each
--     player got that night has their scores pulled halfway back (once they've rated 3+ players).
--  3. Favouritism / grudges: if a rater has rated this player 3+ times before, on average 1.5+ points
--     above (or below) the player's typical rating from everyone, their rating of them counts half.
-- Players never see this; the rating just becomes harder to game. Eligibility still counts every
-- valid rater, so a trimmed outlier never makes someone's rating disappear.

create index if not exists player_ratings_pair_idx on public.player_ratings (rater_id, ratee_id);

create or replace function public.fair_rating(p_session uuid, p_ratee uuid)
returns table (avg_score numeric, n int) language sql stable security definer set search_path = public as $$
  with valid as (
    -- only ratings between verified participants count
    select pr.rater_id, pr.ratee_id, pr.score::numeric score
      from public.player_ratings pr
      join public.session_attendance ra on ra.session_id = p_session and ra.user_id = pr.rater_id and ra.verification = 'verified'
      join public.session_attendance rb on rb.session_id = p_session and rb.user_id = pr.ratee_id and rb.verification = 'verified'
     where pr.session_id = p_session
  ), typical as (
    -- the typical score each player got tonight (a median, so one generous rater can't move it)
    select ratee_id, percentile_cont(0.5) within group (order by score)::numeric md from valid group by ratee_id
  ), lean as (
    -- how far above (or below) the typical score this rater usually was tonight
    select v.rater_id, avg(v.score - t.md) lean, count(*) k from valid v join typical t using (ratee_id) group by v.rater_id
  ),
  mine as (
    select v.rater_id, v.score,
           greatest(1, least(10, v.score - case when l.k >= 3 then 0.5 * l.lean else 0 end)) adj
      from valid v join lean l using (rater_id)
     where v.ratee_id = p_ratee
  ), mid as (select percentile_cont(0.5) within group (order by score)::numeric md, count(*) c from mine),
  past as (
    -- the player's typical rating from everyone in earlier games (a median, so a biased mate can't move it)
    select percentile_cont(0.5) within group (order by score)::numeric md, count(*) c
      from public.player_ratings where ratee_id = p_ratee and session_id <> p_session
  ), history as (
    select m.rater_id,
           (select count(*) from public.player_ratings p where p.rater_id = m.rater_id and p.ratee_id = p_ratee and p.session_id <> p_session) pair_n,
           (select avg(p.score) from public.player_ratings p where p.rater_id = m.rater_id and p.ratee_id = p_ratee and p.session_id <> p_session) pair_avg
      from mine m
  ), weighted as (
    select m.adj,
           case when (select c from mid) >= 4 and abs(m.score - (select md from mid)) > 3 then 0
                when h.pair_n >= 3 and (select c from past) >= 6 and abs(h.pair_avg - (select md from past)) >= 1.5 then 0.5
                else 1 end w
      from mine m join history h using (rater_id)
  )
  select case when sum(w) > 0 then round(sum(adj * w) / sum(w), 2) end, (select count(*)::int from mine) from weighted
$$;
revoke execute on function public.fair_rating(uuid, uuid) from public, anon, authenticated;

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
  left join lateral public.fair_rating(p_session, a.user_id) r on true
  left join lateral (
    select ma.user_id, bool_or(ma.shared) shared from public.motm_awards ma where ma.session_id = p_session and ma.user_id = a.user_id group by ma.user_id
  ) m on true
  where a.session_id = p_session and a.verification = 'verified';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
