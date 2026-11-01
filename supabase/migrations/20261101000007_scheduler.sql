-- Schedule the deadline processor with pg_cron when it is available (it is on
-- hosted Supabase). Locally without pg_cron this migration is a no-op.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('matchday-deadlines', '*/15 * * * *', 'select public.process_session_deadlines()');
  else
    raise notice 'pg_cron not available; schedule public.process_session_deadlines() externally.';
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end $$;
