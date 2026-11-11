-- A new earned card style, Diamond (33 medal points, between Platinum 26 and Hall of Fame 40),
-- and up to five medals on your player card (was three).

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%card_style%' loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%card_medals%' loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles add constraint profiles_card_style_check check (card_style in (
  'classic', 'midnight', 'crimson', 'royal', 'sunset', 'stealth',
  'bronze', 'silver', 'gold', 'platinum', 'diamond', 'hall_of_fame'));
alter table public.profiles add constraint profiles_card_medals_check check (cardinality(card_medals) <= 5);

create or replace function public.card_style_points(p_style text)
returns int language sql immutable as $$
  select case p_style
    when 'classic' then 0 when 'midnight' then 0 when 'crimson' then 0 when 'royal' then 0 when 'sunset' then 0 when 'stealth' then 0
    when 'bronze' then 4 when 'silver' then 8 when 'gold' then 16 when 'platinum' then 26 when 'diamond' then 33 when 'hall_of_fame' then 40 end;
$$;

create or replace function public.set_card_medals(p_codes text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_codes text[] := coalesce(p_codes, '{}');
  v_code text;
  v_tracks text[] := '{}';
  v_track text;
begin
  if v_uid is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  if cardinality(v_codes) > 5 then perform public.raise_app_error('invalid', 'Pick up to five medals.'); end if;
  foreach v_code in array v_codes loop
    if not exists (select 1 from public.player_achievements where user_id = v_uid and achievement_code = v_code) then
      perform public.raise_app_error('medal_locked', 'You haven’t earned that medal yet.');
    end if;
    v_track := regexp_replace(v_code, '_l[0-9]+$', '');
    if v_track = any(v_tracks) then perform public.raise_app_error('invalid', 'One level per medal.'); end if;
    v_tracks := v_tracks || v_track;
  end loop;
  update public.profiles set card_medals = v_codes where id = v_uid;
  return v_codes;
end $$;
