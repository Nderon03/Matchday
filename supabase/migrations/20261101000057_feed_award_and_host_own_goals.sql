-- 1. The feed names the award right: "won Player of the Night" when several games were played.
-- 2. Hosts can change their own goals and assists until the game is finalised (they're
--    auto-approved, so before this a mistake needed a co-host to fix). Still capped by the
--    team totals and written to the review trail and audit log.

create or replace function public.trg_feed_award_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'motm' and new.session_id is not null and not (new.payload ? 'award') then
    new.payload := new.payload || jsonb_build_object('award', public.motm_title(new.session_id));
  end if;
  return new;
end $$;
drop trigger if exists feed_award_name on public.activity_feed;
create trigger feed_award_name before insert on public.activity_feed for each row execute function public.trg_feed_award_name();
update public.activity_feed set payload = payload || jsonb_build_object('award', public.motm_title(session_id))
 where type = 'motm' and session_id is not null and not (payload ? 'award');

create or replace function public.submit_goals(
  p_session uuid, p_goals int, p_assists int default 0, p_breakdown jsonb default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v public.sessions := public.session_or_error(p_session);
  v_existing public.goal_submissions;
  v_id uuid;
  v_late boolean := false;
  v_track_assists boolean := coalesce((select track_assists from public.group_settings where group_id = v.group_id), true);
  v_mgr record;
begin
  perform public.check_rate_limit('submit_goals', 30, interval '1 hour');
  if not public.is_verified_participant(p_session, v_uid)
     and not (v.status = 'in_progress' and exists (
       select 1 from public.team_players tp join public.fixtures f on f.id = tp.fixture_id where f.session_id = p_session and tp.user_id = v_uid)) then
    perform public.raise_app_error('not_participant', 'Only players who took part can submit goals.');
  end if;
  if v.status not in ('in_progress', 'completed', 'finalised') then
    perform public.raise_app_error('locked', 'Goals can be submitted once the match has been played.');
  end if;
  if v.status = 'finalised' then
    -- late claims are allowed for 14 days, or until the group's next session kicks off
    if now() > v.finalised_at + interval '14 days' or exists (
      select 1 from public.sessions n where n.group_id = v.group_id and v.group_id is not null and n.starts_at > v.starts_at
        and n.starts_at < now() and n.status <> 'cancelled') then
      perform public.raise_app_error('locked', 'The window for late goal submissions has closed.');
    end if;
    v_late := true;
  end if;
  if not v_track_assists then p_assists := 0; end if;
  perform public.validate_goal_claim(p_session, v_uid, p_goals, coalesce(p_assists, 0), p_breakdown);

  select * into v_existing from public.goal_submissions where session_id = p_session and user_id = v_uid for update;
  -- hosts may change their own (auto-approved) tally until the game is finalised
  if v_existing.id is not null and v_existing.status not in ('pending', 'clarification_requested')
     and not (public.is_session_manager(p_session, v_uid) and v.status <> 'finalised') then
    perform public.raise_app_error('already_submitted', 'Your goals for this session have already been reviewed.');
  end if;

  insert into public.goal_submissions (session_id, user_id, goals, assists, fixture_breakdown, note, is_late, status)
  values (p_session, v_uid, p_goals, coalesce(p_assists, 0), p_breakdown, p_note, v_late, 'pending')
  on conflict (session_id, user_id) do update set goals = excluded.goals, assists = excluded.assists,
    fixture_breakdown = excluded.fixture_breakdown, note = excluded.note, status = 'pending', submitted_at = now()
  returning id into v_id;

  -- Hosts' (and co-hosts') own claims are approved automatically. They are still
  -- capped by the score, written to the review trail and to the audit log.
  if public.is_session_manager(p_session, v_uid) then
    update public.goal_submissions set status = 'approved', approved_goals = goals, approved_assists = assists where id = v_id;
    insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
    values (v_id, v_uid, 'approved', p_goals, coalesce(p_assists, 0), 'Auto-approved: submitted by the host');
    perform public.apply_approved_goals(v_id);
    if v.status = 'finalised' then
      perform public.compute_session_statistics(p_session);
      perform public.award_achievements(v_uid, p_session);
    end if;
    perform public.log_audit('goals.host_self_approved', 'goal_submission', v_id, jsonb_build_object('goals', p_goals, 'assists', p_assists));
    return v_id;
  end if;

  for v_mgr in
    select distinct u from (
      select v.host_id u union select user_id from public.session_hosts where session_id = p_session
    ) x where u is not null and u <> v_uid
  loop
    perform public.notify(v_mgr.u, 'goals_awaiting_approval', 'Goals awaiting approval',
      (select display_name from public.profiles where id = v_uid) || ' claimed ' || p_goals || ' goal' || case when p_goals = 1 then '' else 's' end || ' in ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'submission_id', v_id));
  end loop;
  perform public.log_audit('goals.submitted', 'goal_submission', v_id, jsonb_build_object('goals', p_goals, 'assists', p_assists, 'late', v_late));
  return v_id;
end $$;
