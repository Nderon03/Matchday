-- A player who was removed and then invited back gets an RSVP task again.
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
