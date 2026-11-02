-- App-wide settings owned by the platform (one row). The booking fee is paid by players on
-- top of the host's price and goes to the platform; it covers Stripe's processing fee (billed to
-- the platform for destination charges) and the rest is platform revenue. Hosts always receive
-- 100% of their price (plus any late fines).
create table public.app_settings (
  id boolean primary key default true check (id),
  booking_fee_rate_bps int not null default 150 check (booking_fee_rate_bps between 0 and 1000),
  booking_fee_fixed_pence int not null default 20 check (booking_fee_fixed_pence between 0 and 500),
  booking_fee_min_pence int not null default 50 check (booking_fee_min_pence between 0 and 500),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict do nothing;
alter table public.app_settings enable row level security;
-- everyone may read (prices are shown before sign-in on invite links); only the service role writes
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;

-- Payment prompts no longer quote the host's price alone (players pay price + booking fee);
-- the app shows the exact total before paying.
create or replace function public.get_pending_tasks()
returns table (kind text, session_id uuid, title text, subtitle text, due_at timestamptz, count int)
language sql stable security definer set search_path = public as $$
  -- invitations awaiting a response
  select 'rsvp', s.id, s.name, 'Are you playing?', s.starts_at, 1
    from public.session_invitations i join public.sessions s on s.id = i.session_id
   where i.user_id = auth.uid() and s.status = 'scheduled' and s.starts_at > now()
     and not exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = auth.uid() and a.status <> 'removed')
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
  select 'payment', s.id, s.name, case when p.kind = 'fine' then 'Late fines due — tap to pay' else 'Payment due — tap to pay' end, s.starts_at, 1
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

create or replace function public.complete_session(p_session uuid, p_voting_hours int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.sessions := public.require_session_manager(p_session);
  v_hours int;
  v_unplayed int;
begin
  if v.status not in ('scheduled', 'in_progress') then
    perform public.raise_app_error('locked', 'This session has already been completed.');
  end if;
  select number into v_unplayed from public.fixtures where session_id = p_session and played = false order by number limit 1;
  if v_unplayed is not null then
    perform public.raise_app_error('fixture_unplayed', 'Game ' || v_unplayed || ' has no score yet. Record it or remove it.');
  end if;

  -- players in a line-up are verified unless the host marked them absent;
  -- confirmed players who never appeared in a line-up are marked absent.
  update public.session_attendance a set verification = 'verified', verified_by = coalesce(a.verified_by, auth.uid()), verified_at = coalesce(a.verified_at, now())
   where a.session_id = p_session and a.status = 'confirmed' and a.verification = 'unverified'
     and exists (select 1 from public.team_players tp join public.fixtures f on f.id = tp.fixture_id where f.session_id = p_session and tp.user_id = a.user_id);
  update public.session_attendance a set verification = 'absent', verified_by = auth.uid(), verified_at = now()
   where a.session_id = p_session and a.verification = 'unverified' and a.status = 'confirmed';

  v_hours := coalesce(p_voting_hours, (select voting_window_hours from public.group_settings where group_id = v.group_id), 48);
  update public.sessions set status = 'completed', completed_at = now(), voting_closes_at = now() + make_interval(hours => v_hours)
   where id = p_session;

  perform public.notify(a.user_id, 'voting_open', 'Full time! Vote for Man of the Match',
    'Rate your teammates and pick the MOTM for ' || v.name || '.', jsonb_build_object('session_id', p_session))
  from public.session_attendance a where a.session_id = p_session and a.verification = 'verified';
  perform public.notify(a.user_id, 'goals_submit', 'Did you score?', 'Submit your goals for ' || v.name || ' — it only takes a second.',
    jsonb_build_object('session_id', p_session))
  from public.session_attendance a where a.session_id = p_session and a.verification = 'verified';

  if v.payment_mode = 'after' and v.price_pence > 0 then
    insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status)
    select p_session, a.user_id, v.host_id, v.price_pence, 'after', 'unpaid'
      from public.session_attendance a
     where a.session_id = p_session and a.verification = 'verified' and a.user_id is distinct from v.host_id
    on conflict (session_id, payer_id, kind) do nothing;
    perform public.notify(a.user_id, 'payment_required', 'Payment due: ' || v.name,
      'Tap to see your total and pay by card, Apple Pay or Google Pay.', jsonb_build_object('session_id', p_session))
    from public.session_attendance a where a.session_id = p_session and a.verification = 'verified' and a.user_id is distinct from v.host_id;
  end if;
  perform public.log_audit('session.completed', 'session', p_session, jsonb_build_object('voting_hours', v_hours));
end $$;
