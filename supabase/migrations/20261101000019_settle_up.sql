-- Paying what you owe.
-- * Settle up before playing: in groups with require_settled (default on), a player with an unpaid
--   bill from an earlier game in that group cannot join another game there until they pay or the
--   host marks it paid in cash. Hosts can still add a player directly.
-- * Upfront sessions: anyone who played without paying gets a bill when the host completes the game.
-- * Reminders: unpaid bills get a nudge after 24 hours and again after 3 days.
-- * Hosts and admins see who owes what.

alter table public.group_settings add column require_settled boolean not null default true;

-- Unpaid bills a player has in a group (optionally ignoring one session).
create or replace function public.outstanding_pence(p_group uuid, p_user uuid, p_exclude_session uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(p.amount_pence), 0)::int
    from public.payments p join public.sessions s on s.id = p.session_id
   where s.group_id = p_group and p.payer_id = p_user and p.status in ('unpaid', 'failed', 'pending')
     and s.status <> 'cancelled' and (p_exclude_session is null or p.session_id <> p_exclude_session)
     -- a checkout started in the last 30 minutes is still in progress, not "unpaid"
     and not (p.status = 'pending' and p.updated_at > now() - interval '30 minutes');
$$;
revoke execute on function public.outstanding_pence(uuid, uuid, uuid) from public, anon, authenticated;


create or replace function public.respond_to_session(p_session uuid, p_response public.rsvp_status)
returns public.rsvp_status language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v public.sessions := public.session_or_error(p_session, true);
  v_current public.session_attendance;
  v_confirmed int;
  v_new public.rsvp_status := p_response;
  v_invited boolean;
  v_owed int;
begin
  if v.status <> 'scheduled' then perform public.raise_app_error('locked', 'This session is no longer accepting responses.'); end if;
  if p_response = 'removed' then perform public.raise_app_error('invalid', 'Invalid response.'); end if;
  v_invited := exists (select 1 from public.session_invitations where session_id = p_session and user_id = v_uid);
  select * into v_current from public.session_attendance where session_id = p_session and user_id = v_uid;
  -- removed players can only come back once the host invites them again
  if v_current.status = 'removed' and not v_invited then
    perform public.raise_app_error('removed', 'The host removed you from this session. Ask them to invite you again.');
  end if;

  if v_current.user_id is null and not v_invited and not public.is_session_manager(p_session, v_uid) then
    if not (v.visibility = 'public' or (v.visibility = 'group' and public.is_group_member(v.group_id, v_uid))) then
      perform public.raise_app_error('forbidden', 'You need an invitation to join this session.');
    end if;
  end if;
  if v.host_id is not null and public.is_blocked_between(v.host_id, v_uid) then
    perform public.raise_app_error('forbidden', 'You cannot join this session.');
  end if;

  if p_response = 'withdrawn' then
    if v_current.status is distinct from 'confirmed' and v_current.status is distinct from 'waitlisted' then
      perform public.raise_app_error('invalid', 'You are not attending this session.');
    end if;
    if v.rsvp_deadline is not null and now() > v.rsvp_deadline and v_current.status = 'confirmed' then
      perform public.raise_app_error('deadline_passed', 'The withdrawal deadline has passed. Please contact the host.');
    end if;
  end if;

  if p_response in ('confirmed', 'waitlisted') then
    if v_current.status = 'confirmed' then return 'confirmed'; end if;
    -- settle up first: unpaid bills from earlier games in this group block joining
    if v.group_id is not null and coalesce((select require_settled from public.group_settings where group_id = v.group_id), true) then
      v_owed := public.outstanding_pence(v.group_id, v_uid, p_session);
      if v_owed > 0 then
        perform public.raise_app_error('unpaid_balance',
          'You owe £' || to_char(v_owed / 100.0, 'FM990.00') || ' from earlier games in this group. Pay it (or ask the host to mark it paid in cash) to join.');
      end if;
    end if;
    v_confirmed := public.confirmed_count(p_session);
    v_new := case when v_confirmed >= v.max_attendance then 'waitlisted' else 'confirmed' end;
    if v_current.status = 'waitlisted' and v_new = 'waitlisted' then return 'waitlisted'; end if;
  end if;

  insert into public.session_attendance (session_id, user_id, status, responded_at, waitlisted_at)
  values (p_session, v_uid, v_new, now(), case when v_new = 'waitlisted' then now() end)
  on conflict (session_id, user_id) do update set
    status = excluded.status, responded_at = now(),
    waitlisted_at = case when excluded.status = 'waitlisted' then coalesce(session_attendance.waitlisted_at, now()) else null end,
    checked_in_at = case when excluded.status = 'confirmed' then session_attendance.checked_in_at else null end,
    verification = case when excluded.status = 'confirmed' then session_attendance.verification else 'unverified' end;

  -- remove from unplayed line-ups when withdrawing
  if v_new in ('withdrawn', 'declined', 'unavailable') then
    delete from public.team_players tp using public.fixtures f
     where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = v_uid;
  end if;

  if v_current.status = 'confirmed' and v_new <> 'confirmed' then
    perform public.promote_from_waitlist(p_session);
  end if;
  if v_new = 'confirmed' and v.host_id is not null and v.host_id <> v_uid then
    perform public.notify(v.host_id, 'attendance_confirmed', 'Player confirmed',
      (select display_name from public.profiles where id = v_uid) || ' is in for ' || v.name || '.',
      jsonb_build_object('session_id', p_session, 'user_id', v_uid));
  end if;
  return v_new;
end $$;

-- Upfront sessions: players who played without paying get a bill at full time.
create or replace function public.on_session_completed_upfront_bills()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.payment_mode = 'upfront' and new.price_pence > 0 then
    for r in
      select a.user_id from public.session_attendance a
       where a.session_id = new.id and a.verification = 'verified' and a.user_id is distinct from new.host_id
         and not exists (select 1 from public.payments p where p.session_id = new.id and p.payer_id = a.user_id and p.kind = 'session')
    loop
      insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status, kind)
      values (new.id, r.user_id, new.host_id, new.price_pence, 'after', 'unpaid', 'session')
      on conflict (session_id, payer_id, kind) do nothing;
      perform public.notify(r.user_id, 'payment_required', 'Payment due: ' || new.name,
        'You played without paying upfront. Tap to pay — you can’t join the next game in this group until it’s settled.',
        jsonb_build_object('session_id', new.id));
    end loop;
  end if;
  return new;
end $$;
create trigger sessions_completed_upfront_bills after update of status on public.sessions
  for each row execute function public.on_session_completed_upfront_bills();
revoke execute on function public.on_session_completed_upfront_bills() from public, anon, authenticated;

-- A player's own unpaid bills in a group (to settle up from the session screen).
create or replace function public.get_my_outstanding(p_group uuid)
returns table (payment_id uuid, session_id uuid, session_name text, played_at timestamptz, kind text, amount_pence int, status public.payment_status)
language sql stable security definer set search_path = public as $$
  select p.id, s.id, s.name, s.starts_at, p.kind, p.amount_pence, p.status
    from public.payments p join public.sessions s on s.id = p.session_id
   where s.group_id = p_group and p.payer_id = auth.uid() and p.status in ('unpaid', 'failed', 'pending') and s.status <> 'cancelled'
   order by s.starts_at;
$$;

-- Hosts / admins: who owes what in a group (unpaid bills + fines not yet on a bill).
create or replace function public.get_group_balances(p_group uuid)
returns table (user_id uuid, unpaid_pence int, owed_fines_pence int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_group_admin(p_group, public.require_user())
          or exists (select 1 from public.sessions s where s.group_id = p_group and public.is_session_manager(s.id, auth.uid()))) then
    perform public.raise_app_error('forbidden', 'Only hosts and admins can see balances.');
  end if;
  return query
  select m.user_id, public.outstanding_pence(p_group, m.user_id, null),
         (select coalesce(sum(f.amount_pence), 0)::int from public.late_fines f where f.group_id = p_group and f.user_id = m.user_id and f.status = 'owed')
    from public.group_members m where m.group_id = p_group;
end $$;


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

  -- 6. Unpaid bills: a reminder after 24 hours and a last one after 3 days
  for r in
    select p.id, p.payer_id, p.session_id, p.amount_pence, s.name, s.group_id,
           case when p.created_at < now() - interval '3 days' then 2 else 1 end as stage
      from public.payments p join public.sessions s on s.id = p.session_id
     where p.status in ('unpaid', 'failed') and p.created_at < now() - interval '24 hours' and s.status <> 'cancelled'
  loop
    if not exists (select 1 from public.notifications n where n.user_id = r.payer_id and n.type = 'payment_reminder'
                    and n.data ->> 'payment_id' = r.id::text and (n.data ->> 'stage')::int >= r.stage) then
      perform public.notify(r.payer_id, 'payment_reminder',
        case when r.stage = 1 then 'Reminder: payment due' else 'Last reminder: payment due' end,
        'You still owe £' || to_char(r.amount_pence / 100.0, 'FM990.00') || ' for ' || r.name
          || case when r.group_id is not null then '. You can’t join the next game in this group until it’s paid.' else '.' end,
        jsonb_build_object('session_id', r.session_id, 'payment_id', r.id, 'stage', r.stage));
      v_reminders := v_reminders + 1;
    end if;
  end loop;

  return jsonb_build_object('finalised', v_finalised, 'reminders', v_reminders, 'created', v_created);
end $$;

revoke execute on function public.process_session_deadlines() from public, anon, authenticated;
