-- Cache for kick-off forecasts (filled by the session-weather Edge Function with the service role).
create table if not exists public.session_weather (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  weather jsonb
);
alter table public.session_weather enable row level security;
revoke all on public.session_weather from anon, authenticated;
