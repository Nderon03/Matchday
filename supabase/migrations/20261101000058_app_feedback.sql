-- "Send feedback" (Settings and the Help menu): a message plus the context that makes it useful
-- (phone, Android version, app version and the last screens visited). It also goes to Sentry's
-- User Feedback inbox; this table is the copy we keep. People only ever see their own.

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null default auth.uid(),
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(trim(message)) between 3 and 2000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_feedback_created_idx on public.app_feedback (created_at desc);
alter table public.app_feedback enable row level security;
drop policy if exists "feedback read own" on public.app_feedback;
create policy "feedback read own" on public.app_feedback for select using (user_id = auth.uid());

create or replace function public.submit_feedback(p_kind text, p_message text, p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_id uuid;
begin
  perform public.check_rate_limit('submit_feedback', 10, interval '1 hour');
  if p_kind not in ('bug', 'idea', 'other') then perform public.raise_app_error('invalid', 'Pick what kind of feedback it is.'); end if;
  if char_length(trim(coalesce(p_message, ''))) < 3 then perform public.raise_app_error('invalid', 'Tell us a little more.'); end if;
  insert into public.app_feedback (user_id, kind, message, context)
  values (v_uid, p_kind, left(trim(p_message), 2000), coalesce(p_context, '{}'::jsonb) - 'email')
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.submit_feedback(text, text, jsonb) to authenticated;
