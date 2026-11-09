-- A game that never happened (fewer than 2 players, nothing played) used to sit "in progress"
-- asking the host for a score. A few hours after it should have ended, it's cancelled
-- automatically and the host is told why. Hosts can also cancel it themselves any time.

create or replace function public.auto_cancel_empty_games()
returns int language plpgsql security definer set search_path = public as $$
declare g record; v_n int := 0;
begin
  for g in
    select s.id, s.name, s.host_id
      from public.sessions s
     where s.status in ('scheduled', 'in_progress')
       and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)) + interval '3 hours' < now()
       and not exists (select 1 from public.fixtures f where f.session_id = s.id and f.played)
       and (select count(*) from public.session_attendance a where a.session_id = s.id and a.status = 'confirmed')
         + (select count(*) from public.session_guests sg where sg.session_id = s.id and sg.status = 'confirmed') < 2
  loop
    update public.sessions set status = 'cancelled', cancelled_at = now() where id = g.id;
    perform public.notify(g.host_id, 'session_cancelled', g.name || ' was cancelled',
      'Not enough players signed up, so there was no score to record. It’s been cleared from your to-do list.',
      jsonb_build_object('session_id', g.id));
    perform public.log_audit('session.auto_cancelled', 'session', g.id, jsonb_build_object('reason', 'fewer than 2 players'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.auto_cancel_empty_games() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('matchday-empty-games', '7 * * * *', 'select public.auto_cancel_empty_games()');
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end $$;
