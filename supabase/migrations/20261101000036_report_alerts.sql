-- Every new report is emailed to the operator (send-notifications picks up rows with no alerted_at).
alter table public.reports add column if not exists alerted_at timestamptz;
-- reports made before this change don't need an email
update public.reports set alerted_at = coalesce(alerted_at, now()) where alerted_at is null;
create index if not exists reports_unalerted_idx on public.reports (created_at) where alerted_at is null;
