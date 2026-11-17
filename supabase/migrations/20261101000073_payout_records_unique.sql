-- One payout record per paid payment, so a Stripe event processed twice (after a failed attempt)
-- can't record the host's payout twice. Any existing duplicates keep their earliest row.
delete from public.payout_records a using public.payout_records b
 where a.payment_id = b.payment_id and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists payout_records_payment_unique on public.payout_records (payment_id);
