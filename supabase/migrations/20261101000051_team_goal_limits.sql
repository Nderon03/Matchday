-- Team goal limits: the goals (and assists) credited to a team's players can never add up to
-- more than that team scored. If John and Smith's team scored 4, John + Smith <= 4 goals, and
-- <= 4 assists. Enforced on every path that changes the numbers (approving, correcting or
-- recording goals, recording or correcting a score, changing a played line-up), with a
-- message that says which team and who is credited.

-- Approved goals per team. A row with a game (fixture) counts for the team the player was on in
-- that game. A row without one counts for the player's team when they only played one game;
-- otherwise it can't be pinned to a team (those stay capped by the player and session checks).
create or replace function public.session_goal_credits(p_session uuid)
returns table (fixture_team_id uuid, user_id uuid, goals int, assists int)
language sql stable security definer set search_path = public as $$
  select tp.fixture_team_id, pg.user_id, sum(pg.goals)::int, sum(pg.assists)::int
    from public.player_goals pg
    left join lateral (
      select (array_agg(tp2.fixture_id))[1] as only_fixture, count(*) as n
        from public.team_players tp2 join public.fixtures f2 on f2.id = tp2.fixture_id
       where f2.session_id = pg.session_id and f2.played and tp2.user_id = pg.user_id
    ) one on true
    join public.team_players tp on tp.user_id = pg.user_id
     and tp.fixture_id = coalesce(pg.fixture_id, case when one.n = 1 then one.only_fixture end)
   where pg.session_id = p_session
   group by tp.fixture_team_id, pg.user_id
$$;
revoke execute on function public.session_goal_credits(uuid) from public, anon, authenticated;

create or replace function public.check_team_goal_limits(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_multi boolean;
begin
  select count(*) > 1 into v_multi from public.fixtures where session_id = p_session and played;
  for t in
    select ft.id, coalesce(nullif(trim(ft.name), ''), 'Team ' || ft.side) as name, ft.score, f.number,
           sum(c.goals)::int as goals, sum(c.assists)::int as assists,
           string_agg(p.display_name || ' ' || c.goals, ', ' order by c.goals desc, p.display_name) filter (where c.goals > 0) as scorers,
           string_agg(p.display_name || ' ' || c.assists, ', ' order by c.assists desc, p.display_name) filter (where c.assists > 0) as assisters
      from public.session_goal_credits(p_session) c
      join public.fixture_teams ft on ft.id = c.fixture_team_id
      join public.fixtures f on f.id = ft.fixture_id
      join public.profiles p on p.id = c.user_id
     where f.played and ft.score is not null
     group by ft.id, ft.name, ft.side, ft.score, f.number
  loop
    if t.goals > t.score then
      perform public.raise_app_error('team_goals',
        t.name || case when v_multi then ' (game ' || t.number || ')' else '' end || ' scored ' || t.score
        || ', but its players would have ' || t.goals || ' goals between them (' || t.scorers || '). Correct someone''s goals first.');
    end if;
    if t.assists > t.score then
      perform public.raise_app_error('team_assists',
        t.name || case when v_multi then ' (game ' || t.number || ')' else '' end || ' scored ' || t.score
        || ', so its players can have at most ' || t.score || ' assists between them, not ' || t.assists || ' (' || t.assisters || '). Correct someone''s assists first.');
    end if;
  end loop;
end $$;
revoke execute on function public.check_team_goal_limits(uuid) from public, anon, authenticated;

-- One trigger function for the three tables that can change a team's totals.
create or replace function public.trg_team_goal_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_session uuid;
begin
  if tg_table_name = 'player_goals' then
    v_session := coalesce(new.session_id, old.session_id);
  else
    v_session := public.session_of_fixture(coalesce(new.fixture_id, old.fixture_id));
  end if;
  -- deletes can only lower the totals
  if tg_op <> 'DELETE' and v_session is not null then
    perform public.check_team_goal_limits(v_session);
  end if;
  return null;
end $$;

drop trigger if exists team_goal_limits on public.player_goals;
create constraint trigger team_goal_limits after insert or update on public.player_goals
  for each row execute function public.trg_team_goal_limits();
drop trigger if exists team_goal_limits on public.fixture_teams;
create constraint trigger team_goal_limits after update of score on public.fixture_teams
  for each row execute function public.trg_team_goal_limits();
drop trigger if exists team_goal_limits on public.team_players;
create constraint trigger team_goal_limits after insert or update on public.team_players
  for each row execute function public.trg_team_goal_limits();

-- Checking a claim up front: say how many the player can still claim, given what their
-- teammates already have approved (so they hear it now, not when the host approves).
create or replace function public.validate_goal_claim(p_session uuid, p_user uuid, p_goals int, p_assists int, p_breakdown jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_max int; v_sum_g int := 0; v_sum_a int := 0; v_g int; v_a int; v_team uuid; v_fix uuid;
        v_mates_g int; v_mates_a int; v_games int;
begin
  if coalesce(p_goals, 0) < 0 or coalesce(p_assists, 0) < 0 then
    perform public.raise_app_error('invalid', 'Goals and assists cannot be negative.');
  end if;
  if p_breakdown is not null and jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0 then
    for v_item in select * from jsonb_array_elements(p_breakdown) loop
      v_g := coalesce((v_item ->> 'goals')::int, 0);
      v_a := coalesce((v_item ->> 'assists')::int, 0);
      select ft.score into v_max
        from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
       where tp.fixture_id = (v_item ->> 'fixture_id')::uuid and tp.user_id = p_user and f.session_id = p_session;
      if not found then
        perform public.raise_app_error('invalid_breakdown', 'You did not play in one of the selected games.');
      end if;
      if v_max is not null and v_g > v_max then
        perform public.raise_app_error('impossible_goals', 'You claimed more goals in a game than your team scored.');
      end if;
      if v_max is not null and v_g + v_a > v_max then
        perform public.raise_app_error('impossible_assists', 'Goals plus assists in a game can''t be more than your team scored (' || v_max || ').');
      end if;
      v_sum_g := v_sum_g + v_g;
      v_sum_a := v_sum_a + v_a;
    end loop;
    if v_sum_g <> p_goals then
      perform public.raise_app_error('invalid_breakdown', 'Your game-by-game goals must add up to your total.');
    end if;
    if v_sum_a <> coalesce(p_assists, 0) and v_sum_a > 0 then
      perform public.raise_app_error('invalid_breakdown', 'Your game-by-game assists must add up to your total.');
    end if;
  end if;
  select coalesce(sum(ft.score), 0), count(*) into v_max, v_games
    from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
   where f.session_id = p_session and tp.user_id = p_user and f.played;
  if p_goals > v_max then
    perform public.raise_app_error('impossible_goals', 'You claimed more goals than your teams scored (' || v_max || ').');
  end if;
  if p_goals + coalesce(p_assists, 0) > v_max then
    perform public.raise_app_error('impossible_assists', 'Goals plus assists can''t be more than your teams scored (' || v_max || ').');
  end if;

  -- what's left for this player once their teammates' approved goals are counted
  for v_fix, v_g, v_a in
    select (b ->> 'fixture_id')::uuid, coalesce((b ->> 'goals')::int, 0), coalesce((b ->> 'assists')::int, 0)
      from jsonb_array_elements(case when coalesce(jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0, false) then p_breakdown else '[]'::jsonb end) b
    union all
    select tp.fixture_id, p_goals, coalesce(p_assists, 0)
      from public.team_players tp join public.fixtures f on f.id = tp.fixture_id
     where v_games = 1 and f.session_id = p_session and f.played and tp.user_id = p_user
       and not coalesce(jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0, false)
  loop
    select tp.fixture_team_id, ft.score into v_team, v_max
      from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id
     where tp.fixture_id = v_fix and tp.user_id = p_user;
    if v_team is null or v_max is null then continue; end if;
    select coalesce(sum(c.goals), 0), coalesce(sum(c.assists), 0) into v_mates_g, v_mates_a
      from public.session_goal_credits(p_session) c where c.fixture_team_id = v_team and c.user_id <> p_user;
    if v_g > v_max - v_mates_g then
      perform public.raise_app_error('team_goals', 'Your team scored ' || v_max || ' and teammates already have ' || v_mates_g
        || ' approved, so ' || case when v_max - v_mates_g <= 0 then 'there are no goals left to claim' else 'you can claim at most ' || (v_max - v_mates_g) end
        || '. If a teammate''s tally is wrong, ask the host to correct it.');
    end if;
    if v_a > v_max - v_mates_a then
      perform public.raise_app_error('team_assists', 'Your team scored ' || v_max || ' and teammates already have ' || v_mates_a
        || ' assists approved, so ' || case when v_max - v_mates_a <= 0 then 'there are no assists left to claim' else 'you can claim at most ' || (v_max - v_mates_a) end
        || '. If a teammate''s tally is wrong, ask the host to correct it.');
    end if;
  end loop;
end $$;
revoke execute on function public.validate_goal_claim(uuid, uuid, int, int, jsonb) from public, anon, authenticated;

-- "Approve all" approves what fits and leaves any claim that would break a team's total
-- waiting, so the host can correct it (instead of the whole batch failing).
create or replace function public.bulk_approve_goals(p_session uuid, p_submissions uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  perform public.require_session_manager(p_session);
  for v_id in
    select id from public.goal_submissions
     where session_id = p_session and status = 'pending' and (p_submissions is null or id = any (p_submissions))
       and user_id <> auth.uid()
     order by submitted_at
  loop
    begin
      perform public.review_goal_submission(v_id, 'approved');
      v_n := v_n + 1;
    exception when sqlstate 'P0001' then
      -- a rule said no (e.g. a team's total): left pending, with its own Approve / Correct buttons
      null;
    end;
  end loop;
  return v_n;
end $$;

-- Hosts can correct assists as well as goals, and record both for a player. When correcting,
-- leaving assists out keeps what the player claimed.
create or replace function public.host_record_goals(p_session uuid, p_user uuid, p_goals int, p_assists int default 0, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_id uuid;
  v_track_assists boolean := coalesce((select track_assists from public.group_settings where group_id = v.group_id), true);
begin
  if p_user = auth.uid() then perform public.raise_app_error('forbidden', 'Submit your own goals for another host to approve.'); end if;
  if v.status not in ('in_progress', 'completed') then perform public.raise_app_error('locked', 'Goals can only be recorded before finalisation.'); end if;
  if not public.is_verified_participant(p_session, p_user) and v.status = 'completed' then
    perform public.raise_app_error('not_participant', 'That player is not a verified participant.');
  end if;
  if not v_track_assists then p_assists := 0; end if;
  perform public.validate_goal_claim(p_session, p_user, p_goals, coalesce(p_assists, 0), null);
  insert into public.goal_submissions (session_id, user_id, goals, assists, note, status, approved_goals, approved_assists)
  values (p_session, p_user, p_goals, coalesce(p_assists, 0), coalesce(p_reason, 'Recorded by host'), 'approved', p_goals, coalesce(p_assists, 0))
  on conflict (session_id, user_id) do update set goals = excluded.goals, assists = excluded.assists, status = 'approved',
    approved_goals = excluded.approved_goals, approved_assists = excluded.approved_assists, fixture_breakdown = null
  returning id into v_id;
  insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
  values (v_id, auth.uid(), 'approved', p_goals, coalesce(p_assists, 0), coalesce(p_reason, 'Recorded by host'));
  perform public.apply_approved_goals(v_id);
  perform public.log_audit('goals.host_recorded', 'goal_submission', v_id, jsonb_build_object('user_id', p_user, 'goals', p_goals, 'assists', coalesce(p_assists, 0)));
end $$;
