-- Creating a game never waits on the postcode lookup: a valid UK postcode is enough, and the
-- app adds the map location (latitude/longitude) as soon as the lookup answers. Until then the
-- game just doesn't appear in "near me" searches. A location, when given, must be in the UK.

create or replace function public.check_session_place(p_postcode text, p_lat double precision, p_lng double precision)
returns void language plpgsql immutable set search_path = public as $$
begin
  if p_postcode is null then
    perform public.raise_app_error('postcode_required', 'Add the venue''s postcode (e.g. NW7 2EU) so players can find it.');
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between 49.5 and 61.0 or p_lng not between -8.7 and 2.0)) then
    perform public.raise_app_error('postcode_unknown', 'We couldn''t find that postcode. Check it and try again.');
  end if;
end $$;

-- the host's app fills in the location once the postcode lookup answers (no notifications)
create or replace function public.set_session_location(p_session uuid, p_postcode text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  -- only for the postcode the game still has (it may have been edited since)
  if v.postcode is distinct from public.normalise_postcode(p_postcode) then return; end if;
  perform public.check_session_place(v.postcode, p_lat, p_lng);
  update public.sessions set latitude = p_lat, longitude = p_lng where id = p_session;
  update public.session_templates set latitude = p_lat, longitude = p_lng
   where id = v.template_id and postcode = v.postcode and latitude is null;
end $$;
grant execute on function public.set_session_location(uuid, text, double precision, double precision) to authenticated;
