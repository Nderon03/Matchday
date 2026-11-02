-- Late fines.
-- A host marks a player "arrived late". In groups with fines switched on, that player is
-- fined in paid sessions: base (£1) doubling with each late arrival, capped (£8). Three
-- on-time paid sessions in a row reset the level. Free sessions are ignored entirely.
-- Fines are added to the player's next payment in that group (for pay-after sessions that is
-- the same session's bill; for upfront sessions the next one). Hosts can waive or adjust a
-- fine, mark it paid in cash, or send a one-off payment request for owed fines.

alter table public.group_settings
  add column late_fines_enabled boolean not null default false,
  add column late_fine_base_pence int not null default 100 check (late_fine_base_pence between 0 and 5000),
  add column late_fine_cap_pence int not null default 800 check (late_fine_cap_pence between 0 and 10000),
  add column late_fine_reset_after int not null default 3 check (late_fine_reset_after between 1 and 20);

-- payments can now be a session fee or a one-off fine payment
alter table public.payments add column kind text not null default 'session' check (kind in ('session', 'fine'));
alter table public.payments drop constraint payments_session_id_payer_id_key;
alter table public.payments add constraint payments_session_payer_kind_key unique (session_id, payer_id, kind);

create table public.late_fines (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  level int not null,
  original_pence int not null check (original_pence >= 0),
  amount_pence int not null check (amount_pence >= 0),
  -- owed: not on a bill yet · included: on an unpaid bill · paid · waived
  status text not null default 'owed' check (status in ('owed', 'included', 'paid', 'waived')),
  payment_id uuid references public.payments (id) on delete set null,
  paid_method text check (paid_method in ('card', 'cash')),
  note text check (note is null or char_length(note) <= 200),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create index late_fines_group_user_idx on public.late_fines (group_id, user_id, status);
create index late_fines_payment_idx on public.late_fines (payment_id);
create trigger late_fines_touch before update on public.late_fines for each row execute function public.touch_updated_at();
alter table public.late_fines enable row level security;
create policy late_fines_select on public.late_fines for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id) or public.is_session_manager(session_id));
revoke insert, update, delete on public.late_fines from authenticated, anon;

-- Escalation state for a player in a group, from paid sessions before a point in time.
create or replace function public.late_state(p_group uuid, p_user uuid, p_before timestamptz)
returns table (level int, on_time_streak int)
language plpgsql stable security definer set search_path = public as $$
declare r record; lvl int := 0; streak int := 0; v_reset int;
begin
  select late_fine_reset_after into v_reset from public.group_settings where group_id = p_group;
  v_reset := coalesce(v_reset, 3);
  for r in
    select a.late_arrival and not exists (
             select 1 from public.late_fines f where f.session_id = s.id and f.user_id = p_user and f.status = 'waived'
           ) as late
      from public.sessions s
      join public.session_attendance a on a.session_id = s.id and a.user_id = p_user and a.verification = 'verified'
     where s.group_id = p_group and s.payment_mode <> 'free' and s.status in ('completed', 'finalised') and s.starts_at < p_before
     order by s.starts_at
  loop
    if r.late then
      lvl := lvl + 1; streak := 0;
    else
      streak := streak + 1;
      if streak >= v_reset then lvl := 0; end if;
    end if;
  end loop;
  return query select lvl, streak;
end $$;

create or replace function public.late_fine_amount(p_group uuid, p_level int)
returns int language sql stable security definer set search_path = public as $$
  select least(gs.late_fine_cap_pence, (gs.late_fine_base_pence * power(2, least(p_level, 20)))::int)
    from public.group_settings gs where gs.group_id = p_group;
$$;

-- Remove a fine from the unpaid bill it sits on (if any).
create or replace function public.detach_late_fine(p_fine uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f public.late_fines; p public.payments;
begin
  select * into f from public.late_fines where id = p_fine for update;
  if f.payment_id is null then return; end if;
  select * into p from public.payments where id = f.payment_id for update;
  if p.status in ('pending', 'authorised') then
    perform public.raise_app_error('payment_in_progress', 'This fine is part of a payment in progress. Try again shortly.');
  end if;
  if p.status in ('paid', 'partially_refunded', 'refunded', 'disputed') then
    perform public.raise_app_error('already_paid', 'This fine has already been paid. Refund it from the payments screen instead.');
  end if;
  if p.kind = 'fine' and p.amount_pence - f.amount_pence <= 0 then
    delete from public.payments where id = p.id and status in ('unpaid', 'failed', 'cancelled');
  elsif p.amount_pence - f.amount_pence > 0 then
    update public.payments set amount_pence = amount_pence - f.amount_pence where id = p.id;
  end if;
  update public.late_fines set payment_id = null, status = 'owed' where id = p_fine;
end $$;

-- Create / remove the fine for one player in one session, to match the host's "late" mark.
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
      || '. Be on time for ' || gs.late_fine_reset_after || ' sessions in a row to reset your fines.',
    jsonb_build_object('session_id', p_session, 'group_id', v.group_id));
  perform public.log_audit('late_fine.created', 'session', p_session, jsonb_build_object('user_id', p_user, 'amount', v_amount, 'level', st.level + 1));
end $$;

create or replace function public.on_session_completed_fines()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for r in select user_id from public.session_attendance where session_id = new.id and verification = 'verified' loop
      perform public.sync_late_fine(new.id, r.user_id);
    end loop;
  end if;
  return new;
end $$;
create trigger sessions_completed_fines after update of status on public.sessions
  for each row execute function public.on_session_completed_fines();

create or replace function public.on_attendance_late_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.late_arrival is distinct from old.late_arrival or new.verification is distinct from old.verification)
     and exists (select 1 from public.sessions where id = new.session_id and status = 'completed') then
    perform public.sync_late_fine(new.session_id, new.user_id);
  end if;
  return new;
end $$;
create trigger attendance_late_fines after update of late_arrival, verification on public.session_attendance
  for each row execute function public.on_attendance_late_change();

-- A new session bill picks up any fines the player owes in that group.
create or replace function public.on_payment_created_add_fines()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_total int;
begin
  if new.kind <> 'session' then return new; end if;
  select group_id into v_group from public.sessions where id = new.session_id;
  if v_group is null then return new; end if;
  select coalesce(sum(amount_pence), 0) into v_total from public.late_fines
   where group_id = v_group and user_id = new.payer_id and status = 'owed' and amount_pence > 0;
  if v_total = 0 then return new; end if;
  update public.late_fines set payment_id = new.id,
         status = case when new.status in ('paid', 'partially_refunded') then 'paid' else 'included' end,
         paid_method = case when new.status in ('paid', 'partially_refunded') then new.method end
   where group_id = v_group and user_id = new.payer_id and status = 'owed' and amount_pence > 0;
  update public.payments set amount_pence = amount_pence + v_total where id = new.id;
  return new;
end $$;
create trigger payments_add_fines after insert on public.payments
  for each row execute function public.on_payment_created_add_fines();

create or replace function public.on_payment_status_fines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if new.status in ('paid', 'partially_refunded') then
    update public.late_fines set status = 'paid', paid_method = new.method where payment_id = new.id and status = 'included';
  elsif new.status = 'cancelled' then
    -- hold released: the fine is owed again and moves to the next bill
    update public.late_fines set status = 'owed', payment_id = null where payment_id = new.id and status = 'included';
  end if;
  return new;
end $$;
create trigger payments_status_fines after update of status on public.payments
  for each row execute function public.on_payment_status_fines();

-- ---------------------------------------------------------------------------
-- Host / admin overrides
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_fine(p_fine uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.late_fines f where f.id = p_fine
    and (public.is_group_admin(f.group_id, p_user) or public.is_session_manager(f.session_id, p_user)));
$$;

create or replace function public.update_late_fine(p_fine uuid, p_action text, p_amount int default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); f public.late_fines; v_old int; p public.payments;
begin
  select * into f from public.late_fines where id = p_fine for update;
  if f.id is null then perform public.raise_app_error('not_found', 'Fine not found.'); end if;
  if not public.can_manage_fine(p_fine, v_uid) then perform public.raise_app_error('forbidden', 'Only the host or a group admin can change fines.'); end if;
  if f.status in ('paid', 'waived') then perform public.raise_app_error('locked', 'This fine is already ' || f.status || '.'); end if;
  v_old := f.amount_pence;

  if p_action = 'waive' then
    perform public.detach_late_fine(p_fine);
    update public.late_fines set status = 'waived', amount_pence = 0, note = nullif(trim(p_note), ''), updated_by = v_uid where id = p_fine;
    perform public.notify(f.user_id, 'late_fine_waived', 'Late fine waived', 'Your £' || to_char(v_old / 100.0, 'FM990.00') || ' late fine was waived.'
      || coalesce(' ' || nullif(trim(p_note), ''), ''), jsonb_build_object('session_id', f.session_id, 'group_id', f.group_id));
  elsif p_action = 'adjust' then
    if p_amount is null or p_amount < 0 or p_amount > 10000 then perform public.raise_app_error('invalid', 'Enter an amount between £0 and £100.'); end if;
    if f.payment_id is not null then
      select * into p from public.payments where id = f.payment_id for update;
      if p.status not in ('unpaid', 'failed') then perform public.raise_app_error('payment_in_progress', 'This fine is part of a payment in progress.'); end if;
      if p.amount_pence - v_old + p_amount <= 0 then perform public.raise_app_error('invalid', 'Waive the fine instead.'); end if;
      update public.payments set amount_pence = amount_pence - v_old + p_amount where id = p.id;
    end if;
    update public.late_fines set amount_pence = p_amount, note = nullif(trim(p_note), ''), updated_by = v_uid where id = p_fine;
    perform public.notify(f.user_id, 'late_fine', 'Late fine changed', 'Your late fine is now £' || to_char(p_amount / 100.0, 'FM990.00') || '.'
      || coalesce(' ' || nullif(trim(p_note), ''), ''), jsonb_build_object('session_id', f.session_id, 'group_id', f.group_id));
  elsif p_action = 'paid_cash' then
    perform public.detach_late_fine(p_fine);
    update public.late_fines set status = 'paid', paid_method = 'cash', note = nullif(trim(p_note), ''), updated_by = v_uid where id = p_fine;
  else
    perform public.raise_app_error('invalid', 'Unknown action.');
  end if;
  perform public.log_audit('late_fine.' || p_action, 'late_fine', p_fine, jsonb_build_object('from', v_old, 'to', p_amount, 'note', p_note));
end $$;

-- One-off card payment request for everything a player owes in fines in a group.
create or replace function public.request_late_fine_payment(p_group uuid, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_total int; v_session uuid; v_host uuid; v_id uuid; v_gname text;
begin
  if not public.is_group_admin(p_group, v_uid) then
    perform public.raise_app_error('forbidden', 'Only group admins can request fine payments.');
  end if;
  select coalesce(sum(amount_pence), 0) into v_total from public.late_fines where group_id = p_group and user_id = p_user and status = 'owed';
  if v_total < 100 then perform public.raise_app_error('invalid', 'There’s less than £1 owed — add it to their next session instead.'); end if;
  select f.session_id, s.host_id into v_session, v_host from public.late_fines f join public.sessions s on s.id = f.session_id
   where f.group_id = p_group and f.user_id = p_user and f.status = 'owed' order by s.starts_at desc limit 1;
  insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status, kind)
  values (v_session, p_user, coalesce(v_host, v_uid), v_total, 'after', 'unpaid', 'fine')
  on conflict (session_id, payer_id, kind) do update set amount_pence = payments.amount_pence + excluded.amount_pence
    where payments.status in ('unpaid', 'failed')
  returning id into v_id;
  if v_id is null then perform public.raise_app_error('payment_in_progress', 'A fine payment is already in progress.'); end if;
  update public.late_fines set payment_id = v_id, status = 'included' where group_id = p_group and user_id = p_user and status = 'owed';
  select name into v_gname from public.groups where id = p_group;
  perform public.notify(p_user, 'payment_required', 'Late fines due: £' || to_char(v_total / 100.0, 'FM990.00'),
    'Your owed late fines in ' || v_gname || '. Tap to pay.', jsonb_build_object('session_id', v_session, 'payment_id', v_id));
  perform public.log_audit('late_fine.payment_requested', 'group', p_group, jsonb_build_object('user_id', p_user, 'amount', v_total));
  return v_id;
end $$;

-- What a player can see about their own fines in a group (or an admin about a member).
create or replace function public.get_late_status(p_group uuid, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_viewer uuid := public.require_user(); v_user uuid := coalesce(p_user, v_viewer); gs public.group_settings; st record;
begin
  if v_user <> v_viewer and not public.is_group_admin(p_group, v_viewer) then
    perform public.raise_app_error('forbidden', 'Insufficient permissions.');
  end if;
  select * into gs from public.group_settings where group_id = p_group;
  select * into st from public.late_state(p_group, v_user, now() + interval '100 years');
  return jsonb_build_object(
    'enabled', coalesce(gs.late_fines_enabled, false),
    'base_pence', gs.late_fine_base_pence, 'cap_pence', gs.late_fine_cap_pence, 'reset_after', gs.late_fine_reset_after,
    'level', st.level, 'on_time_streak', st.on_time_streak,
    'next_fine_pence', public.late_fine_amount(p_group, st.level),
    'sessions_to_reset', case when st.level > 0 then gs.late_fine_reset_after - st.on_time_streak end,
    'owed_pence', (select coalesce(sum(amount_pence), 0) from public.late_fines where group_id = p_group and user_id = v_user and status in ('owed', 'included')),
    'fines', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'session_id', f.session_id, 'session_name', s.name, 'date', s.starts_at,
                'level', f.level, 'amount_pence', f.amount_pence, 'original_pence', f.original_pence, 'status', f.status, 'note', f.note) order by s.starts_at desc), '[]'::jsonb)
                from public.late_fines f join public.sessions s on s.id = f.session_id where f.group_id = p_group and f.user_id = v_user)
  );
end $$;

-- Admin view: everyone's outstanding fines in a group.
create or replace function public.get_group_fines(p_group uuid)
returns table (fine_id uuid, user_id uuid, display_name text, avatar_url text, session_id uuid, session_name text, played_at timestamptz,
               level int, amount_pence int, original_pence int, status text, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_admin(p_group, public.require_user()) then perform public.raise_app_error('forbidden', 'Only group admins can see fines.'); end if;
  return query
  select f.id, f.user_id, p.display_name, p.avatar_url, f.session_id, s.name, s.starts_at, f.level, f.amount_pence, f.original_pence, f.status, f.note
    from public.late_fines f join public.profiles p on p.id = f.user_id join public.sessions s on s.id = f.session_id
   where f.group_id = p_group
   order by (f.status in ('owed', 'included')) desc, s.starts_at desc;
end $$;


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
      'Your share is £' || to_char(v.price_pence / 100.0, 'FM990.00') || '. Tap to pay.', jsonb_build_object('session_id', p_session))
    from public.session_attendance a where a.session_id = p_session and a.verification = 'verified' and a.user_id is distinct from v.host_id;
  end if;
  perform public.log_audit('session.completed', 'session', p_session, jsonb_build_object('voting_hours', v_hours));
end $$;

create or replace function public.record_cash_payment(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.payment_mode = 'free' then perform public.raise_app_error('invalid', 'This session is free.'); end if;
  if exists (select 1 from public.payments where session_id = p_session and payer_id = p_user and kind = 'session' and status in ('authorised', 'paid', 'pending')) then
    perform public.raise_app_error('invalid', 'This player already has a card payment in progress.');
  end if;
  insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status, method, paid_at)
  values (p_session, p_user, auth.uid(), v.price_pence, case when v.payment_mode = 'upfront' then 'upfront' else 'after' end::public.payment_mode, 'paid', 'cash', now())
  on conflict (session_id, payer_id, kind) do update set status = 'paid', method = 'cash', paid_at = now(), stripe_checkout_session_id = null;
  perform public.log_audit('payment.cash_recorded', 'session', p_session, jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.get_payment_summary(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session); v_res jsonb;
begin
  if not public.is_session_manager(p_session, public.require_user()) then
    perform public.raise_app_error('forbidden', 'Only the host can see the payment dashboard.');
  end if;
  with expected as (
    select a.user_id from public.session_attendance a
     where a.session_id = p_session and a.status = 'confirmed' and a.verification <> 'absent' and a.user_id is distinct from v.host_id
  ), rows as (
    select e.user_id, pr.username, pr.display_name, pr.avatar_url,
           coalesce(p.status, 'unpaid') status, p.amount_pence, p.method, p.paid_at, p.id payment_id,
           (select coalesce(sum(f.amount_pence), 0) from public.late_fines f where f.payment_id = p.id)::int fines_pence,
           (select coalesce(sum(r.amount_pence), 0) from public.refunds r where r.payment_id = p.id and r.status = 'succeeded') refunded
      from expected e join public.profiles pr on pr.id = e.user_id
      left join public.payments p on p.session_id = p_session and p.payer_id = e.user_id and p.kind = 'session'
    union
    select p.payer_id, pr.username, pr.display_name, pr.avatar_url, p.status, p.amount_pence, p.method, p.paid_at, p.id,
           (select coalesce(sum(f.amount_pence), 0) from public.late_fines f where f.payment_id = p.id)::int,
           (select coalesce(sum(r.amount_pence), 0) from public.refunds r where r.payment_id = p.id and r.status = 'succeeded')
      from public.payments p join public.profiles pr on pr.id = p.payer_id
     where p.session_id = p_session and p.kind = 'session' and p.payer_id not in (select user_id from expected)
  )
  select jsonb_build_object(
    'price_pence', v.price_pence,
    'payment_mode', v.payment_mode,
    'host_confirmed_at', v.host_confirmed_at,
    'collected_pence', coalesce(sum(case when status in ('paid', 'partially_refunded') then coalesce(amount_pence, 0) - refunded end), 0),
    'authorised_pence', coalesce(sum(case when status = 'authorised' then amount_pence end), 0),
    'outstanding_pence', coalesce(sum(case when status in ('unpaid', 'failed', 'pending') then coalesce(amount_pence, v.price_pence) end), 0),
    'paid_count', count(*) filter (where status in ('paid', 'partially_refunded')),
    'unpaid_count', count(*) filter (where status in ('unpaid', 'pending')),
    'failed_count', count(*) filter (where status = 'failed'),
    'refunded_count', count(*) filter (where status = 'refunded'),
    'players', coalesce(jsonb_agg(to_jsonb(rows) order by display_name), '[]'::jsonb)
  ) into v_res from rows;
  return v_res;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.late_state(uuid,uuid,timestamptz)', 'public.late_fine_amount(uuid,int)', 'public.detach_late_fine(uuid)',
    'public.sync_late_fine(uuid,uuid)', 'public.on_session_completed_fines()', 'public.on_attendance_late_change()',
    'public.on_payment_created_add_fines()', 'public.on_payment_status_fines()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.late_fines;
  end if;
end $$;


-- Line-up payment badges only reflect the session bill (not one-off fine payments).
create or replace function public.get_session_payment_statuses(p_session uuid)
returns table (user_id uuid, status public.payment_status, method text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_session(p_session, public.require_user()) then
    perform public.raise_app_error('forbidden', 'Insufficient permissions.');
  end if;
  return query select p.payer_id, p.status, p.method from public.payments p where p.session_id = p_session and p.kind = 'session';
end $$;
