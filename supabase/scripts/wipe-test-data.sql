-- WIPE ALL USER DATA — gives the app a completely fresh start.
-- Deletes every account, group, session, payment record, notification and stat.
-- Keeps the database structure, booking-fee settings (app_settings) and the achievements catalogue.
-- Run in Supabase → SQL Editor. THIS CANNOT BE UNDONE.
-- Stripe is not touched: test payments/accounts stay in your Stripe dashboard (harmless).
-- Uploaded photos: empty the storage buckets in Supabase → Storage afterwards (SQL can't delete them).

begin;

do $$
declare v_tables text;
begin
  select string_agg(format('public.%I', tablename), ', ')
    into v_tables
    from pg_tables
   where schemaname = 'public'
     and tablename not in ('app_settings', 'achievements');
  execute 'truncate table ' || v_tables || ' restart identity cascade';
end $$;

delete from auth.users;

commit;

-- Check: every count should be 0
select (select count(*) from auth.users) as users,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from public.sessions) as sessions,
       (select count(*) from public.payments) as payments;
