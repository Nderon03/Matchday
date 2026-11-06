-- Player card styles: six free base colours so every card has some character, then earned
-- styles (Bronze to Hall of Fame) unlocked with medal points, which also get animated effects.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%card_style%' loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles add constraint profiles_card_style_check check (card_style in (
  'classic', 'midnight', 'crimson', 'royal', 'sunset', 'stealth',
  'bronze', 'silver', 'gold', 'platinum', 'hall_of_fame'));

create or replace function public.card_style_points(p_style text)
returns int language sql immutable as $$
  select case p_style
    when 'classic' then 0 when 'midnight' then 0 when 'crimson' then 0 when 'royal' then 0 when 'sunset' then 0 when 'stealth' then 0
    when 'bronze' then 4 when 'silver' then 8 when 'gold' then 16 when 'platinum' then 26 when 'hall_of_fame' then 40 end;
$$;
