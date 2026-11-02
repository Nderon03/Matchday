-- Record which version of the Terms of Use and Privacy Policy each user accepted (at onboarding).
alter table public.profiles add column terms_accepted_at timestamptz;
alter table public.profiles add column terms_version text;

drop function if exists public.complete_onboarding(text, text, public.player_position);
create or replace function public.complete_onboarding(
  p_username text, p_display_name text, p_position public.player_position,
  p_accept_terms boolean default false, p_terms_version text default null
) returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_row public.profiles;
  v_accept boolean := coalesce(p_accept_terms, false) and coalesce(trim(p_terms_version), '') <> '';
begin
  select * into v_row from public.profiles where id = v_uid;
  -- new players must accept the terms; onboarded players also use this to change their username
  if not v_row.onboarded and not v_accept then
    perform public.raise_app_error('terms_required', 'Please agree to the Terms of Use and Privacy Policy to continue.');
  end if;
  if not public.is_username_available(p_username) and p_username is distinct from v_row.username::text then
    perform public.raise_app_error('username_taken', 'That username is not available.');
  end if;
  update public.profiles
     set username = p_username, display_name = trim(p_display_name), position = p_position, onboarded = true,
         terms_accepted_at = case when v_accept then now() else terms_accepted_at end,
         terms_version = case when v_accept then trim(p_terms_version) else terms_version end
   where id = v_uid returning * into v_row;
  return v_row;
end $$;
grant execute on function public.complete_onboarding(text, text, public.player_position, boolean, text) to authenticated;

-- Accept updated terms later (when LEGAL_VERSION changes).
create or replace function public.accept_terms(p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_version), '') = '' then perform public.raise_app_error('invalid', 'Missing terms version.'); end if;
  update public.profiles set terms_accepted_at = now(), terms_version = trim(p_version) where id = public.require_user();
end $$;
grant execute on function public.accept_terms(text) to authenticated;
