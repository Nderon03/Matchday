-- 1. Several games in a session: goals and assists are split by game, so each one counts for
--    the team the player was actually on (teams can change between games). Claims, host
--    corrections and goals the host records all take a game-by-game split.
-- 2. Own goals and goals nobody claimed: the host can mark them per team, so a team's total
--    adds up exactly (credited + own goals + no scorer <= score). Own goals can't have an assist.

alter table public.fixture_teams
  add column if not exists own_goals int not null default 0 check (own_goals between 0 and 99),
  add column if not exists unclaimed_goals int not null default 0 check (unclaimed_goals between 0 and 99);
alter table public.goal_submissions add column if not exists approved_breakdown jsonb;

-- team totals now include own goals and goals with no scorer
create or replace function public.check_team_goal_limits(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_multi boolean; v_label text;
begin
  select count(*) > 1 into v_multi from public.fixtures where session_id = p_session and played;
  for t in
    select ft.id, coalesce(nullif(trim(ft.name), ''), 'Team ' || ft.side) as name, ft.score, ft.own_goals, ft.unclaimed_goals, f.number,
           coalesce(sum(c.goals), 0)::int as goals, coalesce(sum(c.assists), 0)::int as assists,
           string_agg(p.display_name || ' ' || c.goals, ', ' order by c.goals desc, p.display_name) filter (where c.goals > 0) as scorers,
           string_agg(p.display_name || ' ' || c.assists, ', ' order by c.assists desc, p.display_name) filter (where c.assists > 0) as assisters
      from public.fixture_teams ft
      join public.fixtures f on f.id = ft.fixture_id
      left join public.session_goal_credits(p_session) c on c.fixture_team_id = ft.id
      left join public.profiles p on p.id = c.user_id
     where f.session_id = p_session and f.played and ft.score is not null
     group by ft.id, ft.name, ft.side, ft.score, ft.own_goals, ft.unclaimed_goals, f.number
  loop
    v_label := t.name || case when v_multi then ' (game ' || t.number || ')' else '' end;
    if t.goals + t.own_goals + t.unclaimed_goals > t.score then
      perform public.raise_app_error('team_goals',
        v_label || ' scored ' || t.score || ', but ' ||
        case when t.goals > 0 then 'its players would have ' || t.goals || ' goals between them (' || t.scorers || ')' else 'nobody has goals yet' end ||
        case when t.own_goals + t.unclaimed_goals > 0
          then ' plus ' || concat_ws(' and ', nullif(t.own_goals, 0) || ' own goal' || case when t.own_goals = 1 then '' else 's' end,
                                              nullif(t.unclaimed_goals, 0) || ' with no scorer') else '' end ||
        '. Correct someone''s goals first.');
    end if;
    if t.assists > t.score - t.own_goals then
      perform public.raise_app_error('team_assists',
        v_label || ' scored ' || t.score || case when t.own_goals > 0 then ' (' || t.own_goals || ' of them own goals)' else '' end
        || ', so its players can have at most ' || (t.score - t.own_goals) || ' assists between them, not ' || t.assists
        || ' (' || t.assisters || '). Correct someone''s assists first.');
    end if;
  end loop;
end $$;
revoke execute on function public.check_team_goal_limits(uuid) from public, anon, authenticated;

drop trigger if exists team_goal_limits on public.fixture_teams;
create constraint trigger team_goal_limits after update of score, own_goals, unclaimed_goals on public.fixture_teams
  for each row execute function public.trg_team_goal_limits();

-- the claim check: split required for several games; room left counts own goals / no scorer
create or replace function public.validate_goal_claim(p_session uuid, p_user uuid, p_goals int, p_assists int, p_breakdown jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_max int; v_sum_g int := 0; v_sum_a int := 0; v_g int; v_a int; v_team uuid; v_fix uuid;
        v_mates_g int; v_mates_a int; v_games int; v_own int; v_none int;
        v_split boolean := coalesce(jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0, false);
begin
  if coalesce(p_goals, 0) < 0 or coalesce(p_assists, 0) < 0 then
    perform public.raise_app_error('invalid', 'Goals and assists cannot be negative.');
  end if;
  if v_split then
    for v_item in select * from jsonb_array_elements(p_breakdown) loop
      v_g := coalesce((v_item ->> 'goals')::int, 0);
      v_a := coalesce((v_item ->> 'assists')::int, 0);
      if v_g < 0 or v_a < 0 then perform public.raise_app_error('invalid', 'Goals and assists cannot be negative.'); end if;
      select ft.score into v_max
        from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
       where tp.fixture_id = (v_item ->> 'fixture_id')::uuid and tp.user_id = p_user and f.session_id = p_session;
      if not found then
        perform public.raise_app_error('invalid_breakdown', 'That player wasn''t in one of the selected games.');
      end if;
      if v_max is not null and v_g > v_max then
        perform public.raise_app_error('impossible_goals', 'More goals in a game than the team scored.');
      end if;
      if v_max is not null and v_g + v_a > v_max then
        perform public.raise_app_error('impossible_assists', 'Goals plus assists in a game can''t be more than the team scored (' || v_max || ').');
      end if;
      v_sum_g := v_sum_g + v_g;
      v_sum_a := v_sum_a + v_a;
    end loop;
    if v_sum_g <> p_goals then
      perform public.raise_app_error('invalid_breakdown', 'The game-by-game goals must add up to the total.');
    end if;
    if v_sum_a <> coalesce(p_assists, 0) then
      perform public.raise_app_error('invalid_breakdown', 'The game-by-game assists must add up to the total.');
    end if;
  end if;
  select coalesce(sum(ft.score), 0), count(*) into v_max, v_games
    from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id join public.fixtures f on f.id = tp.fixture_id
   where f.session_id = p_session and tp.user_id = p_user and f.played;
  if v_games > 1 and not v_split and coalesce(p_goals, 0) + coalesce(p_assists, 0) > 0 then
    perform public.raise_app_error('split_required', 'Played in ' || v_games || ' games, so say which game each goal and assist was in.');
  end if;
  if p_goals > v_max then
    perform public.raise_app_error('impossible_goals', 'You claimed more goals than your teams scored (' || v_max || ').');
  end if;
  if p_goals + coalesce(p_assists, 0) > v_max then
    perform public.raise_app_error('impossible_assists', 'Goals plus assists can''t be more than your teams scored (' || v_max || ').');
  end if;

  -- what's left for this player in each game, once teammates, own goals and no-scorer goals count
  for v_fix, v_g, v_a in
    select (b ->> 'fixture_id')::uuid, coalesce((b ->> 'goals')::int, 0), coalesce((b ->> 'assists')::int, 0)
      from jsonb_array_elements(case when v_split then p_breakdown else '[]'::jsonb end) b
    union all
    select tp.fixture_id, p_goals, coalesce(p_assists, 0)
      from public.team_players tp join public.fixtures f on f.id = tp.fixture_id
     where v_games = 1 and not v_split and f.session_id = p_session and f.played and tp.user_id = p_user
  loop
    select tp.fixture_team_id, ft.score, ft.own_goals, ft.unclaimed_goals into v_team, v_max, v_own, v_none
      from public.team_players tp join public.fixture_teams ft on ft.id = tp.fixture_team_id
     where tp.fixture_id = v_fix and tp.user_id = p_user;
    if v_team is null or v_max is null then continue; end if;
    select coalesce(sum(c.goals), 0), coalesce(sum(c.assists), 0) into v_mates_g, v_mates_a
      from public.session_goal_credits(p_session) c where c.fixture_team_id = v_team and c.user_id <> p_user;
    if v_g > v_max - v_mates_g - v_own - v_none then
      perform public.raise_app_error('team_goals', 'The team scored ' || v_max || ' and '
        || concat_ws(', ', case when v_mates_g > 0 then v_mates_g || ' already credited to teammates' end,
                           case when v_own > 0 then v_own || ' marked as own goal' || case when v_own = 1 then '' else 's' end end,
                           case when v_none > 0 then v_none || ' marked as no scorer' end)
        || ', so ' || case when v_max - v_mates_g - v_own - v_none <= 0 then 'there are no goals left to claim' else 'the most left is ' || (v_max - v_mates_g - v_own - v_none) end
        || '. If that''s wrong, ask the host to correct it.');
    end if;
    if v_a > v_max - v_own - v_mates_a then
      perform public.raise_app_error('team_assists', 'The team scored ' || v_max || ' and teammates already have ' || v_mates_a
        || ' assists' || case when v_own > 0 then ' (and ' || v_own || ' own goal' || case when v_own = 1 then '' else 's' end || ' can''t be assisted)' else '' end
        || ', so ' || case when v_max - v_own - v_mates_a <= 0 then 'there are no assists left to claim' else 'the most left is ' || (v_max - v_own - v_mates_a) end
        || '. If that''s wrong, ask the host to correct it.');
    end if;
  end loop;
end $$;
revoke execute on function public.validate_goal_claim(uuid, uuid, int, int, jsonb) from public, anon, authenticated;

-- approved goals: the host's corrected split, the player's split, or one total
create or replace function public.apply_approved_goals(p_submission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.goal_submissions; v_item jsonb; v_split jsonb; v_total_scored int; v_total_claimed int; v_total_assists int;
begin
  select * into g from public.goal_submissions where id = p_submission;
  delete from public.player_goals where submission_id = p_submission;
  if g.status in ('approved', 'corrected') then
    v_split := case when g.status = 'corrected' then g.approved_breakdown else g.fixture_breakdown end;
    if v_split is not null and jsonb_typeof(v_split) = 'array' and jsonb_array_length(v_split) > 0 then
      for v_item in select * from jsonb_array_elements(v_split) loop
        insert into public.player_goals (session_id, fixture_id, user_id, goals, assists, submission_id)
        values (g.session_id, (v_item ->> 'fixture_id')::uuid, g.user_id, coalesce((v_item ->> 'goals')::int, 0), coalesce((v_item ->> 'assists')::int, 0), g.id);
      end loop;
    else
      insert into public.player_goals (session_id, user_id, goals, assists, submission_id)
      values (g.session_id, g.user_id, g.approved_goals, g.approved_assists, g.id);
    end if;
    select coalesce(sum(ft.score), 0) into v_total_scored from public.fixture_teams ft join public.fixtures f on f.id = ft.fixture_id where f.session_id = g.session_id;
    select coalesce(sum(goals), 0), coalesce(sum(assists), 0) into v_total_claimed, v_total_assists from public.player_goals where session_id = g.session_id;
    if v_total_assists > v_total_scored then
      perform public.raise_app_error('impossible_assists', 'Approving this would credit more assists (' || v_total_assists || ') than goals were scored in the game (' || v_total_scored || ').');
    end if;
    if v_total_claimed > v_total_scored then
      perform public.raise_app_error('impossible_goals', 'Approving this would credit more goals (' || v_total_claimed || ') than were scored in the game (' || v_total_scored || ').');
    end if;
  end if;
end $$;

-- host corrections take a game-by-game split too
drop function if exists public.review_goal_submission(uuid, public.submission_status, int, int, text);
create or replace function public.review_goal_submission(
  p_submission uuid, p_action public.submission_status, p_goals int default null, p_assists int default null, p_reason text default null,
  p_breakdown jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); g public.goal_submissions; v public.sessions;
  v_split boolean := coalesce(jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0, false);
  v_assists int;
begin
  select * into g from public.goal_submissions where id = p_submission for update;
  if g.id is null then perform public.raise_app_error('not_found', 'Submission not found.'); end if;
  if g.user_id = v_uid then perform public.raise_app_error('forbidden', 'You cannot approve your own goals.'); end if;
  if not public.can_review_submission(p_submission, v_uid) then
    perform public.raise_app_error('forbidden', 'Only the host can review goal submissions.');
  end if;
  select * into v from public.sessions where id = g.session_id;
  if p_action = 'pending' then perform public.raise_app_error('invalid', 'Choose approve, reject, correct or ask for clarification.'); end if;
  if p_action in ('corrected', 'clarification_requested') and coalesce(trim(p_reason), '') = '' then
    perform public.raise_app_error('reason_required', 'Please add a short explanation.');
  end if;
  if p_action = 'corrected' then
    if v_split then
      select coalesce(sum((b ->> 'goals')::int), 0), coalesce(sum((b ->> 'assists')::int), 0) into p_goals, p_assists from jsonb_array_elements(p_breakdown) b;
    end if;
    if p_goals is null or p_goals < 0 then perform public.raise_app_error('invalid', 'Enter the corrected number of goals.'); end if;
    v_assists := coalesce(p_assists, g.assists);
    perform public.validate_goal_claim(g.session_id, g.user_id, p_goals, v_assists, case when v_split then p_breakdown end);
  end if;

  update public.goal_submissions set
    status = p_action,
    approved_goals = case p_action when 'approved' then g.goals when 'corrected' then p_goals else null end,
    approved_assists = case p_action when 'approved' then g.assists when 'corrected' then v_assists else null end,
    approved_breakdown = case when p_action = 'corrected' and v_split then p_breakdown end
   where id = p_submission;
  insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
  values (p_submission, v_uid, p_action, case when p_action = 'corrected' then p_goals else g.goals end,
          case when p_action = 'corrected' then v_assists else g.assists end, p_reason);
  perform public.apply_approved_goals(p_submission);

  if v.status = 'finalised' and p_action in ('approved', 'corrected') then
    perform public.compute_session_statistics(g.session_id);
    perform public.award_achievements(g.user_id, g.session_id);
  end if;

  perform public.notify(g.user_id, 'goals_reviewed',
    case p_action when 'approved' then 'Goals approved ✅' when 'corrected' then 'Goals corrected' when 'rejected' then 'Goals not approved'
      else 'Host needs clarification' end,
    coalesce(p_reason, case p_action when 'approved' then 'Your ' || g.goals || case when g.goals = 1 then ' goal now counts' else ' goals now count' end || ' towards your stats.' else '' end),
    jsonb_build_object('session_id', g.session_id));
  perform public.log_audit('goals.' || p_action::text, 'goal_submission', p_submission,
    jsonb_build_object('goals', p_goals, 'assists', p_assists, 'breakdown', p_breakdown, 'reason', p_reason, 'original_goals', g.goals));
end $$;

drop function if exists public.host_record_goals(uuid, uuid, int, int, text);
create or replace function public.host_record_goals(p_session uuid, p_user uuid, p_goals int, p_assists int default 0, p_reason text default null,
  p_breakdown jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_id uuid;
  v_track_assists boolean := coalesce((select track_assists from public.group_settings where group_id = v.group_id), true);
  v_split boolean := coalesce(jsonb_typeof(p_breakdown) = 'array' and jsonb_array_length(p_breakdown) > 0, false);
begin
  if p_user = auth.uid() then perform public.raise_app_error('forbidden', 'Submit your own goals for another host to approve.'); end if;
  if v.status not in ('in_progress', 'completed') then perform public.raise_app_error('locked', 'Goals can only be recorded before finalisation.'); end if;
  if not public.is_verified_participant(p_session, p_user) and v.status = 'completed' then
    perform public.raise_app_error('not_participant', 'That player is not a verified participant.');
  end if;
  if v_split then
    select coalesce(sum((b ->> 'goals')::int), 0), coalesce(sum((b ->> 'assists')::int), 0) into p_goals, p_assists from jsonb_array_elements(p_breakdown) b;
  end if;
  if not v_track_assists then p_assists := 0; end if;
  perform public.validate_goal_claim(p_session, p_user, p_goals, coalesce(p_assists, 0), case when v_split then p_breakdown end);
  insert into public.goal_submissions (session_id, user_id, goals, assists, note, status, approved_goals, approved_assists, fixture_breakdown)
  values (p_session, p_user, p_goals, coalesce(p_assists, 0), coalesce(p_reason, 'Recorded by host'), 'approved', p_goals, coalesce(p_assists, 0), case when v_split then p_breakdown end)
  on conflict (session_id, user_id) do update set goals = excluded.goals, assists = excluded.assists, status = 'approved',
    approved_goals = excluded.approved_goals, approved_assists = excluded.approved_assists, fixture_breakdown = excluded.fixture_breakdown, approved_breakdown = null
  returning id into v_id;
  insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
  values (v_id, auth.uid(), 'approved', p_goals, coalesce(p_assists, 0), coalesce(p_reason, 'Recorded by host'));
  perform public.apply_approved_goals(v_id);
  perform public.log_audit('goals.host_recorded', 'goal_submission', v_id, jsonb_build_object('user_id', p_user, 'goals', p_goals, 'assists', coalesce(p_assists, 0), 'breakdown', p_breakdown));
end $$;

-- the host marks a team's own goals and goals nobody claimed
create or replace function public.set_team_unassigned_goals(p_fixture_team uuid, p_own_goals int, p_unclaimed int)
returns void language plpgsql security definer set search_path = public as $$
declare ft public.fixture_teams; v_session uuid; v public.sessions;
begin
  select * into ft from public.fixture_teams where id = p_fixture_team;
  if ft.id is null then perform public.raise_app_error('not_found', 'Team not found.'); end if;
  v_session := public.session_of_fixture(ft.fixture_id);
  v := public.require_session_manager(v_session);
  if v.status not in ('in_progress', 'completed', 'finalised') or not (select played from public.fixtures where id = ft.fixture_id) then
    perform public.raise_app_error('locked', 'Record the score first.');
  end if;
  if coalesce(p_own_goals, 0) < 0 or coalesce(p_unclaimed, 0) < 0 then
    perform public.raise_app_error('invalid', 'Numbers can''t be negative.');
  end if;
  update public.fixture_teams set own_goals = coalesce(p_own_goals, 0), unclaimed_goals = coalesce(p_unclaimed, 0) where id = p_fixture_team;
  perform public.log_audit('fixture.unassigned_goals', 'fixture_team', p_fixture_team,
    jsonb_build_object('own_goals', p_own_goals, 'unclaimed', p_unclaimed, 'before', jsonb_build_object('own_goals', ft.own_goals, 'unclaimed', ft.unclaimed_goals)));
end $$;
grant execute on function public.set_team_unassigned_goals(uuid, int, int) to authenticated;
grant execute on function public.review_goal_submission(uuid, public.submission_status, int, int, text, jsonb) to authenticated;
grant execute on function public.host_record_goals(uuid, uuid, int, int, text, jsonb) to authenticated;
