-- Run ONCE in the Supabase SQL editor (per environment) after deploying Edge Functions.
-- Stores secrets in Vault and schedules the push/email sender and payment housekeeping.
-- Replace the placeholders; never commit the real values.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- safe to re-run: clear any earlier copies first
select cron.unschedule(jobname) from cron.job where jobname in ('matchday-send-notifications', 'matchday-payments-cron');
delete from vault.secrets where name in ('matchday_project_url', 'matchday_cron_secret');

select vault.create_secret('https://<project-ref>.supabase.co', 'matchday_project_url');
select vault.create_secret('<long-random-cron-secret>', 'matchday_cron_secret'); -- same value as the CRON_SECRET function secret

select cron.schedule('matchday-send-notifications', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'matchday_project_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'matchday_cron_secret')),
    body := '{}'::jsonb)
$$);

select cron.schedule('matchday-payments-cron', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'matchday_project_url') || '/functions/v1/payments-cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'matchday_cron_secret')),
    body := '{}'::jsonb)
$$);
