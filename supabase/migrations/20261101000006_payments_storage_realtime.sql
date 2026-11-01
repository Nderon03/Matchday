-- Payments helpers, storage buckets, realtime publication and function grants.

alter table public.payments add column method text not null default 'card' check (method in ('card', 'cash'));

-- Status shown on the line-up (green tick / amber clock / red cross) for participants.
create or replace function public.get_session_payment_statuses(p_session uuid)
returns table (user_id uuid, status public.payment_status, method text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_session(p_session, public.require_user()) then
    perform public.raise_app_error('forbidden', 'Insufficient permissions.');
  end if;
  return query select p.payer_id, p.status, p.method from public.payments p where p.session_id = p_session;
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
           (select coalesce(sum(r.amount_pence), 0) from public.refunds r where r.payment_id = p.id and r.status = 'succeeded') refunded
      from expected e join public.profiles pr on pr.id = e.user_id
      left join public.payments p on p.session_id = p_session and p.payer_id = e.user_id
    union
    select p.payer_id, pr.username, pr.display_name, pr.avatar_url, p.status, p.amount_pence, p.method, p.paid_at, p.id,
           (select coalesce(sum(r.amount_pence), 0) from public.refunds r where r.payment_id = p.id and r.status = 'succeeded')
      from public.payments p join public.profiles pr on pr.id = p.payer_id
     where p.session_id = p_session and p.payer_id not in (select user_id from expected)
  )
  select jsonb_build_object(
    'price_pence', v.price_pence,
    'payment_mode', v.payment_mode,
    'host_confirmed_at', v.host_confirmed_at,
    'collected_pence', coalesce(sum(case when status in ('paid', 'partially_refunded') then coalesce(amount_pence, 0) - refunded end), 0),
    'authorised_pence', coalesce(sum(case when status = 'authorised' then amount_pence end), 0),
    'outstanding_pence', coalesce(sum(case when status in ('unpaid', 'failed', 'pending') then v.price_pence end), 0),
    'paid_count', count(*) filter (where status in ('paid', 'partially_refunded')),
    'unpaid_count', count(*) filter (where status in ('unpaid', 'pending')),
    'failed_count', count(*) filter (where status = 'failed'),
    'refunded_count', count(*) filter (where status = 'refunded'),
    'players', coalesce(jsonb_agg(to_jsonb(rows) order by display_name), '[]'::jsonb)
  ) into v_res from rows;
  return v_res;
end $$;

-- Host attests that a player paid in cash (shown distinctly from card payments).
create or replace function public.record_cash_payment(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.payment_mode = 'free' then perform public.raise_app_error('invalid', 'This session is free.'); end if;
  if exists (select 1 from public.payments where session_id = p_session and payer_id = p_user and status in ('authorised', 'paid', 'pending')) then
    perform public.raise_app_error('invalid', 'This player already has a card payment in progress.');
  end if;
  insert into public.payments (session_id, payer_id, payee_id, amount_pence, mode, status, method, paid_at)
  values (p_session, p_user, auth.uid(), v.price_pence, case when v.payment_mode = 'upfront' then 'upfront' else 'after' end::public.payment_mode, 'paid', 'cash', now())
  on conflict (session_id, payer_id) do update set status = 'paid', method = 'cash', paid_at = now(), stripe_checkout_session_id = null;
  perform public.log_audit('payment.cash_recorded', 'session', p_session, jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.mark_host_confirmed(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  if v.status in ('scheduled', 'cancelled') and v.starts_at > now() then
    perform public.raise_app_error('too_early', 'You can confirm the session once it has kicked off.');
  end if;
  update public.sessions set host_confirmed_at = coalesce(host_confirmed_at, now()) where id = p_session;
  perform public.log_audit('payment.host_confirmed_session', 'session', p_session);
end $$;

-- Notify on server-confirmed payment state changes (only webhooks/service role change status).
create or replace function public.on_payment_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status = old.status then return new; end if;
  select name into v_name from public.sessions where id = new.session_id;
  if new.status = 'paid' then
    perform public.notify(new.payer_id, 'payment_confirmed', 'Payment confirmed', '£' || to_char(new.amount_pence / 100.0, 'FM990.00') || ' for ' || v_name || '.',
      jsonb_build_object('session_id', new.session_id, 'payment_id', new.id));
    if new.payee_id is not null and new.method = 'card' then
      perform public.notify(new.payee_id, 'payment_received', 'Payment received', (select display_name from public.profiles where id = new.payer_id) || ' paid for ' || v_name || '.',
        jsonb_build_object('session_id', new.session_id));
    end if;
  elsif new.status = 'authorised' then
    perform public.notify(new.payer_id, 'payment_confirmed', 'Payment authorised', 'Your card is authorised for ' || v_name || '. You''ll only be charged once the host confirms the game took place.',
      jsonb_build_object('session_id', new.session_id, 'payment_id', new.id));
  elsif new.status = 'failed' then
    perform public.notify(new.payer_id, 'payment_failed', 'Payment failed', coalesce(new.failure_reason, 'Your payment for ' || v_name || ' did not go through.'),
      jsonb_build_object('session_id', new.session_id, 'payment_id', new.id));
  elsif new.status in ('refunded', 'cancelled') then
    perform public.notify(new.payer_id, 'payment_refunded', case when new.status = 'refunded' then 'Refund issued' else 'Payment released' end,
      'Your payment for ' || v_name || ' has been ' || case when new.status = 'refunded' then 'refunded.' else 'released — you were not charged.' end,
      jsonb_build_object('session_id', new.session_id, 'payment_id', new.id));
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, data)
  values (auth.uid(), 'payment.status_' || new.status::text, 'payment', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end $$;
create trigger payments_status_notify after update of status on public.payments
  for each row execute function public.on_payment_status_change();

-- ---------------------------------------------------------------------------
-- Storage buckets & policies (avatars, group images, share cards)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true), ('group-images', 'group-images', true), ('share-cards', 'share-cards', true)
on conflict (id) do nothing;

create policy "avatars read" on storage.objects for select using (bucket_id in ('avatars', 'group-images', 'share-cards'));
create policy "avatars write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "group images admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-images' and public.is_group_admin(((storage.foldername(name))[1])::uuid));
create policy "group images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'group-images' and public.is_group_admin(((storage.foldername(name))[1])::uuid));
create policy "share cards own" on storage.objects for insert to authenticated
  with check (bucket_id = 'share-cards' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime (RLS still applies to every change event)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.notifications, public.session_attendance, public.fixtures, public.fixture_teams, public.team_players,
      public.goal_submissions, public.payments, public.activity_feed, public.comments, public.sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Function grants: internal helpers are not callable by clients.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.notify(uuid,text,text,text,jsonb)',
    'public.post_activity(uuid,text,jsonb,uuid,uuid)',
    'public.log_audit(text,text,uuid,jsonb)',
    'public.compute_session_statistics(uuid)',
    'public.award_achievements(uuid,uuid)',
    'public.decide_motm(uuid,uuid,uuid,uuid)',
    'public.apply_approved_goals(uuid)',
    'public.promote_from_waitlist(uuid)',
    'public.create_fixture_row(uuid,int)',
    'public.validate_goal_claim(uuid,uuid,int,jsonb)',
    'public.session_or_error(uuid,boolean)',
    'public.require_session_manager(uuid)',
    'public.assert_voting_open(uuid,uuid)',
    'public.leaderboard_rows(text,uuid,uuid,timestamptz,timestamptz,uuid)',
    'public.check_rate_limit(text,int,interval)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
-- Username checks are allowed before sign-up.
grant execute on function public.is_username_available(text) to anon;
