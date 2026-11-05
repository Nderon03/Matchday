-- Grammar: singular/plural in notification messages ("1 goal", not "1 goal(s)"; "1 session", not "1 sessions").

create or replace function public.review_goal_submission(
  p_submission uuid, p_action public.submission_status, p_goals int default null, p_assists int default null, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); g public.goal_submissions; v public.sessions;
begin
  select * into g from public.goal_submissions where id = p_submission for update;
  if g.id is null then perform public.raise_app_error('not_found', 'Submission not found.'); end if;
  if g.user_id = v_uid then perform public.raise_app_error('forbidden', 'You cannot approve your own goals.'); end if;
  if not public.can_review_submission(p_submission, v_uid) then
    perform public.raise_app_error('forbidden', 'Only the host can review goal submissions.');
  end if;
  select * into v from public.sessions where id = g.session_id;
  if p_action = 'pending' then perform public.raise_app_error('invalid', 'Choose approve, reject, correct or ask for clarification.'); end if;
  if p_action in ('corrected', 'rejected', 'clarification_requested') and coalesce(trim(p_reason), '') = '' and p_action <> 'rejected' then
    perform public.raise_app_error('reason_required', 'Please add a short explanation.');
  end if;
  if p_action = 'corrected' then
    if p_goals is null or p_goals < 0 then perform public.raise_app_error('invalid', 'Enter the corrected number of goals.'); end if;
    perform public.validate_goal_claim(g.session_id, g.user_id, p_goals, coalesce(p_assists, g.assists), null);
  end if;

  update public.goal_submissions set
    status = p_action,
    approved_goals = case p_action when 'approved' then g.goals when 'corrected' then p_goals else null end,
    approved_assists = case p_action when 'approved' then g.assists when 'corrected' then coalesce(p_assists, g.assists) else null end
   where id = p_submission;
  insert into public.goal_reviews (submission_id, reviewer_id, action, goals, assists, reason)
  values (p_submission, v_uid, p_action, case when p_action = 'corrected' then p_goals else g.goals end,
          case when p_action = 'corrected' then coalesce(p_assists, g.assists) else g.assists end, p_reason);
  perform public.apply_approved_goals(p_submission);

  -- late approvals after finalisation flow through the audited recompute path
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
    jsonb_build_object('goals', p_goals, 'assists', p_assists, 'reason', p_reason, 'original_goals', g.goals));
end $$;

create or replace function public.sync_late_fine(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.sessions;
  gs public.group_settings;
  a public.session_attendance;
  existing public.late_fines;
  st record;
  v_amount int;
  v_gname text;
begin
  select * into v from public.sessions where id = p_session;
  if v.group_id is null or v.payment_mode = 'free' or v.status not in ('completed') then return; end if;
  select * into gs from public.group_settings where group_id = v.group_id;
  select * into a from public.session_attendance where session_id = p_session and user_id = p_user;
  select * into existing from public.late_fines where session_id = p_session and user_id = p_user;

  if not coalesce(gs.late_fines_enabled, false) or p_user = v.host_id or a.verification is distinct from 'verified' or not a.late_arrival then
    -- no longer late (host corrected it): drop a fine that hasn't been paid
    if existing.id is not null and existing.status in ('owed', 'included') then
      perform public.detach_late_fine(existing.id);
      delete from public.late_fines where id = existing.id;
    end if;
    return;
  end if;
  if existing.id is not null then return; end if;

  select * into st from public.late_state(v.group_id, p_user, v.starts_at);
  v_amount := public.late_fine_amount(v.group_id, st.level);
  if v_amount <= 0 then return; end if;
  insert into public.late_fines (group_id, session_id, user_id, level, original_pence, amount_pence)
  values (v.group_id, p_session, p_user, st.level + 1, v_amount, v_amount);
  select name into v_gname from public.groups where id = v.group_id;
  perform public.notify(p_user, 'late_fine', 'Late fine: £' || to_char(v_amount / 100.0, 'FM990.00'),
    'You were marked late for ' || v.name || '. The fine is added to your next payment in ' || v_gname
      || case when gs.late_fine_reset_after = 1 then '. Be on time next session to reset your fines.' else '. Be on time for ' || gs.late_fine_reset_after || ' sessions in a row to reset your fines.' end,
    jsonb_build_object('session_id', p_session, 'group_id', v.group_id));
  perform public.log_audit('late_fine.created', 'session', p_session, jsonb_build_object('user_id', p_user, 'amount', v_amount, 'level', st.level + 1));
end $$;
