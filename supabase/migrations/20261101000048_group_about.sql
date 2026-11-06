-- One "About" text for a group instead of a description and separate rules: existing rules are
-- moved into the description (room for both), and the app no longer writes rules.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.groups'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%description%' loop
    execute format('alter table public.groups drop constraint %I', c);
  end loop;
end $$;
alter table public.groups add constraint groups_description_length check (description is null or char_length(description) <= 2000);

update public.groups
   set description = left(concat_ws(E'\n\n', nullif(trim(description), ''), nullif(trim(rules), '')), 2000), rules = null
 where nullif(trim(rules), '') is not null;
