-- Show up to three medals on your player card (your choice of which, and at which level).
alter table public.profiles add column if not exists card_medals text[] not null default '{}'
  check (cardinality(card_medals) <= 3);

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
  if cardinality(v_codes) > 3 then perform public.raise_app_error('invalid', 'Pick up to three medals.'); end if;
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
revoke execute on function public.set_card_medals(text[]) from public, anon;
grant execute on function public.set_card_medals(text[]) to authenticated;
