-- Minimum booking fee is 60p (already set on the live project; this keeps new databases in line).
alter table public.app_settings alter column booking_fee_min_pence set default 60;
update public.app_settings set booking_fee_min_pence = 60, updated_at = now() where booking_fee_min_pence = 50;
