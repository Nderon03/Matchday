-- Guests are paid for by the player who brings them.
-- * A player's session bill covers them plus their confirmed guests (price × (1 + guests)), in one payment.
-- * Guests added after the player has already paid get a separate "guest fee" bill (kind = 'guest').
-- * Guests that drop out before payment come off the bill automatically.
-- * The host's own guests are free (the host doesn't pay themselves).
-- * Unpaid guest fees count towards "settle up before playing" like any other bill.

alter table public.payments add column guest_count int not null default 0 check (guest_count >= 0);
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('session', 'fine', 'guest'));

-- Confirmed guests a player has brought to a session.
create or replace function public.guest_count_for(p_session uuid, p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.session_guests where session_id = p_session and added_by = p_user and status = 'confirmed';
$$;

-- New session bills include the player's guests.
create or replace function public.on_payment_insert_guests()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.sessions; n int;
begin
  if new.kind <> 'session' or new.guest_count > 0 then return new; end if;
  select * into v from public.sessions where id = new.session_id;
  if v.price_pence <= 0 or new.payer_id = v.host_id then return new; end if;
  n := public.guest_count_for(new.session_id, new.payer_id);
  if n > 0 then
    new.guest_count := n;
    new.amount_pence := new.amount_pence + n * v.price_pence;
  end if;
  return new;
end $$;
create trigger payments_insert_guests before insert on public.payments
  for each row execute function public.on_payment_insert_guests();

-- Keep a player's bills in line with the guests they have in the squad.
create or replace function public.sync_guest_bill(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.sessions;
  s public.payments;
  g public.payments;
  n int;
  v_closed int;
  v_extra int;
begin
  if p_user is null then return; end if;
  select * into v from public.sessions where id = p_session;
  if v.id is null or v.payment_mode = 'free' or v.price_pence <= 0 or p_user = v.host_id or v.status in ('cancelled', 'finalised') then return; end if;
  n := public.guest_count_for(p_session, p_user);
  select * into s from public.payments where session_id = p_session and payer_id = p_user and kind = 'session' for update;
  select * into g from public.payments where session_id = p_session and payer_id = p_user and kind = 'guest' for update;
  if s.id is null then return; end if; -- the bill is created later and picks up guests then

  if s.status in ('unpaid', 'failed', 'cancelled', 'pending') then
    -- not paid yet: guests ride on the main bill
    if n <> s.guest_count then
      update public.payments set guest_count = n, amount_pence = amount_pence + (n - s.guest_count) * v.price_pence where id = s.id;
    end if;
    if g.id is not null and g.status in ('unpaid', 'failed', 'cancelled') then delete from public.payments where id = g.id; end if;
    return;
  end if;

  -- main bill already paid / held: anything extra goes on a guest-fee bill
  v_closed := s.guest_count + case when g.id is not null and g.status not in ('unpaid', 'failed', 'cancelled', 'pending') then g.guest_count else 0 end;
  v_extra := n - v_closed;
  if g.id is not null and g.status in ('unpaid', 'failed', 'cancelled', 'pending') then
    if v_extra > 0 then
      update public.payments set guest_count = v_extra, amount_pence = v_extra * v.price_pence where id = g.id;
    elsif g.status <> 'pending' then
      delete from public.payments where id = g.id;
    end if;
  elsif g.id is null and v_extra > 0 then
    insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status, kind, guest_count)
    values (p_session, p_user, v.host_id, v_extra * v.price_pence, 'after', 'unpaid', 'guest', v_extra);
    perform public.notify(p_user, 'payment_required', 'Guest fee: ' || v.name,
      'You''ve already paid for yourself, so your guest' || case when v_extra > 1 then 's are' else ' is' end
        || ' billed separately: £' || to_char(v_extra * v.price_pence / 100.0, 'FM990.00') || '. Tap to pay.',
      jsonb_build_object('session_id', p_session));
  end if;
end $$;

create or replace function public.on_guest_change_bill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_guest_bill(old.session_id, old.added_by);
    return old;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.sync_guest_bill(new.session_id, new.added_by);
  end if;
  return new;
end $$;
create trigger session_guests_bill after insert or update of status or delete on public.session_guests
  for each row execute function public.on_guest_change_bill();

-- A main bill being paid (or released) may leave guests uncovered: re-check.
create or replace function public.on_payment_status_guests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'session' and new.status is distinct from old.status then
    perform public.sync_guest_bill(new.session_id, new.payer_id);
  end if;
  return new;
end $$;
create trigger payments_status_guests after update of status on public.payments
  for each row execute function public.on_payment_status_guests();

-- Cash from the host settles the player's guest fee too.
create or replace function public.record_cash_payment(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.payment_mode = 'free' then perform public.raise_app_error('invalid', 'This session is free.'); end if;
  if exists (select 1 from public.payments where session_id = p_session and payer_id = p_user and kind = 'session' and status in ('authorised', 'paid', 'pending')) then
    if exists (select 1 from public.payments where session_id = p_session and payer_id = p_user and kind = 'guest' and status in ('unpaid', 'failed', 'cancelled')) then
      update public.payments set status = 'paid', method = 'cash', paid_at = now(), stripe_checkout_session_id = null
       where session_id = p_session and payer_id = p_user and kind = 'guest';
      perform public.log_audit('payment.cash_recorded', 'session', p_session, jsonb_build_object('user_id', p_user, 'kind', 'guest'));
      return;
    end if;
    perform public.raise_app_error('invalid', 'This player already has a card payment in progress.');
  end if;
  insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status, method, paid_at)
  values (p_session, p_user, auth.uid(), v.price_pence, case when v.payment_mode = 'upfront' then 'upfront' else 'after' end::public.payment_mode, 'paid', 'cash', now())
  on conflict (session_id, payer_id, kind) do update set status = 'paid', method = 'cash', paid_at = now(), stripe_checkout_session_id = null;
  update public.payments set status = 'paid', method = 'cash', paid_at = now(), stripe_checkout_session_id = null
   where session_id = p_session and payer_id = p_user and kind = 'guest' and status in ('unpaid', 'failed', 'cancelled');
  perform public.log_audit('payment.cash_recorded', 'session', p_session, jsonb_build_object('user_id', p_user));
end $$;

-- Host dashboard: each player's bill shows their guests and any separate guest fee.
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
  ), base as (
    select e.user_id, p.* from expected e
      left join public.payments p on p.session_id = p_session and p.payer_id = e.user_id and p.kind = 'session'
    union all
    select p.payer_id, p.* from public.payments p
     where p.session_id = p_session and p.kind = 'session' and p.payer_id not in (select user_id from expected)
  ), rows as (
    select b.user_id, pr.username, pr.display_name, pr.avatar_url,
           coalesce(b.status, 'unpaid') status,
           coalesce(b.amount_pence, v.price_pence * (1 + public.guest_count_for(p_session, b.user_id))) amount_pence,
           b.method, b.paid_at, b.id payment_id,
           coalesce(b.guest_count, public.guest_count_for(p_session, b.user_id)) guest_count,
           (select coalesce(sum(f.amount_pence), 0) from public.late_fines f where f.payment_id = b.id)::int fines_pence,
           (select coalesce(sum(r.amount_pence), 0) from public.refunds r where r.payment_id = b.id and r.status = 'succeeded') refunded,
           gb.id guest_payment_id, gb.status guest_status, gb.amount_pence guest_amount_pence, gb.guest_count guest_bill_count
      from base b join public.profiles pr on pr.id = b.user_id
      left join public.payments gb on gb.session_id = p_session and gb.payer_id = b.user_id and gb.kind = 'guest'
  )
  select jsonb_build_object(
    'price_pence', v.price_pence,
    'payment_mode', v.payment_mode,
    'host_confirmed_at', v.host_confirmed_at,
    'collected_pence', coalesce(sum(case when status in ('paid', 'partially_refunded') then amount_pence - refunded else 0 end
                         + case when guest_status in ('paid', 'partially_refunded') then guest_amount_pence else 0 end), 0),
    'authorised_pence', coalesce(sum(case when status = 'authorised' then amount_pence else 0 end), 0),
    'outstanding_pence', coalesce(sum(case when status in ('unpaid', 'failed', 'pending') then amount_pence else 0 end
                         + case when guest_status in ('unpaid', 'failed', 'pending') then guest_amount_pence else 0 end), 0),
    'paid_count', count(*) filter (where status in ('paid', 'partially_refunded')),
    'unpaid_count', count(*) filter (where status in ('unpaid', 'pending')),
    'failed_count', count(*) filter (where status = 'failed'),
    'refunded_count', count(*) filter (where status = 'refunded'),
    'players', coalesce(jsonb_agg(to_jsonb(rows) order by display_name), '[]'::jsonb)
  ) into v_res from rows;
  return v_res;
end $$;

-- A player who drops out takes their guests with them (they were coming as that player's guests,
-- and the player pays for them). Host removals are handled separately (the host chooses).
create or replace function public.on_attendance_dropout_guests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'confirmed' and new.status in ('declined', 'unavailable', 'withdrawn') then
    update public.session_guests set status = 'withdrawn', decided_by = new.user_id, decided_at = now()
     where session_id = new.session_id and added_by = new.user_id and status in ('confirmed', 'pending');
    delete from public.team_players tp using public.fixtures f, public.session_guests g
     where tp.fixture_id = f.id and f.played = false and tp.guest_id = g.id
       and g.session_id = new.session_id and g.added_by = new.user_id and g.status = 'withdrawn';
  end if;
  return new;
end $$;
create trigger attendance_dropout_guests after update of status on public.session_attendance
  for each row execute function public.on_attendance_dropout_guests();

do $$
declare f text;
begin
  foreach f in array array[
    'public.guest_count_for(uuid,uuid)', 'public.on_payment_insert_guests()', 'public.sync_guest_bill(uuid,uuid)',
    'public.on_guest_change_bill()', 'public.on_payment_status_guests()', 'public.on_attendance_dropout_guests()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
