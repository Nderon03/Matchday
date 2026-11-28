-- Celebration moments (new friends, medal level-ups, match reveals, season reveals, group welcomes)
-- are remembered on the ACCOUNT, not just the device: once you've seen one on your phone it won't
-- play again on the website or another phone. Each row is a small marker: a key ("friends",
-- "reveal:<session id>", …) and a value ("1", or the time up to which you've seen things).
create table if not exists public.seen_moments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  value text not null check (char_length(value) between 1 and 64),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.seen_moments enable row level security;
drop policy if exists "seen moments read own" on public.seen_moments;
create policy "seen moments read own" on public.seen_moments for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.seen_moments from authenticated, anon;

-- Record markers for the signed-in user. A value only ever moves forward (times are ISO strings,
-- so the later one is also the greater one), so an older device can't make you see things again.
create or replace function public.mark_moments_seen(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); r record; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return; end if;
  for r in select key, value from jsonb_each_text(p) loop
    n := n + 1;
    if n > 100 then exit; end if;
    if r.key is null or r.value is null or char_length(r.key) > 120 or char_length(r.value) > 64 or r.value = '' then continue; end if;
    insert into public.seen_moments (user_id, key, value) values (v_uid, r.key, r.value)
    on conflict (user_id, key) do update set value = greatest(seen_moments.value, excluded.value), updated_at = now();
  end loop;
end $$;
revoke execute on function public.mark_moments_seen(jsonb) from public, anon;
grant execute on function public.mark_moments_seen(jsonb) to authenticated;
