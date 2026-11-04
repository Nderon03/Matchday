-- Every session has a UK postcode (plus venue name where there is one), so games can be found by
-- distance. The app looks the postcode up with postcodes.io (Ordnance Survey / Royal Mail open data) and
-- sends its coordinates; the database checks the postcode format and that the point is in the UK.

alter table public.sessions add column postcode text;
alter table public.sessions add column latitude double precision;
alter table public.sessions add column longitude double precision;
alter table public.session_templates add column postcode text;
alter table public.session_templates add column latitude double precision;
alter table public.session_templates add column longitude double precision;
create index sessions_public_geo_idx on public.sessions (latitude, longitude) where visibility = 'public' and status = 'scheduled';

-- "nw7  2eu" → "NW7 2EU"; null when it isn't a UK postcode shape
create or replace function public.normalise_postcode(p text)
returns text language sql immutable set search_path = public as $$
  select case when c ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$' then left(c, length(c) - 3) || ' ' || right(c, 3) end
    from (select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')) as c) x;
$$;

create or replace function public.check_session_place(p_postcode text, p_lat double precision, p_lng double precision)
returns void language plpgsql immutable set search_path = public as $$
begin
  if p_postcode is null then
    perform public.raise_app_error('postcode_required', 'Add the venue''s postcode (e.g. NW7 2EU) so players can find it.');
  end if;
  if p_lat is null or p_lng is null or p_lat not between 49.5 and 61.0 or p_lng not between -8.7 and 2.0 then
    perform public.raise_app_error('postcode_unknown', 'We couldn''t find that postcode. Check it and try again.');
  end if;
end $$;

-- straight-line distance in miles (null if either point is missing)
create or replace function public.miles_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    3958.8 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
  end;
$$;

create or replace function public.create_session(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_id uuid;
  v_group uuid := nullif(p ->> 'group_id', '')::uuid;
  v_format int := coalesce((p ->> 'format_size')::int, 5);
  v_invitee uuid;
  v_host public.profiles;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_payment public.payment_mode := coalesce(p ->> 'payment_mode', 'free')::public.payment_mode;
  v_postcode text := public.normalise_postcode(p ->> 'postcode');
  v_lat double precision := nullif(p ->> 'latitude', '')::double precision;
  v_lng double precision := nullif(p ->> 'longitude', '')::double precision;
begin
  perform public.check_session_place(v_postcode, v_lat, v_lng);
  perform public.check_rate_limit('create_session', 30, interval '1 day');
  if v_starts is null then perform public.raise_app_error('invalid', 'Choose a date and kick-off time.'); end if;
  if v_starts < now() - interval '1 day' then
    perform public.raise_app_error('invalid', 'Sessions cannot be created more than a day in the past.');
  end if;
  if v_group is not null and not public.is_group_member(v_group, v_uid) then
    perform public.raise_app_error('forbidden', 'You must be a member of the group to create a session for it.');
  end if;

  insert into public.sessions (
    group_id, host_id, template_id, name, starts_at, duration_minutes, location, venue, postcode, latitude, longitude, format_size,
    max_attendance, visibility, description, payment_mode, price_pence, mode, motm_mode, rsvp_deadline
  ) values (
    v_group, v_uid, nullif(p ->> 'template_id', '')::uuid, trim(p ->> 'name'), v_starts,
    coalesce((p ->> 'duration_minutes')::int, 60), p ->> 'location', p ->> 'venue', v_postcode, v_lat, v_lng, v_format,
    coalesce((p ->> 'max_attendance')::int, v_format * 2),
    coalesce(p ->> 'visibility', case when v_group is null then 'private' else 'group' end)::public.session_visibility,
    p ->> 'description', v_payment,
    case when v_payment = 'free' then 0 else coalesce((p ->> 'price_pence')::int, 0) end,
    coalesce(p ->> 'mode', 'single')::public.session_mode,
    coalesce(p ->> 'motm_mode', (select default_motm_mode::text from public.group_settings where group_id = v_group), 'session')::public.motm_mode,
    nullif(p ->> 'rsvp_deadline', '')::timestamptz
  ) returning id into v_id;

  -- the host is attending by default
  insert into public.session_attendance (session_id, user_id, status) values (v_id, v_uid, 'confirmed');
  perform public.create_fixture_row(v_id, 1);

  select * into v_host from public.profiles where id = v_uid;
  for v_invitee in select distinct (jsonb_array_elements_text(coalesce(p -> 'invitee_ids', '[]'::jsonb)))::uuid loop
    continue when v_invitee = v_uid;
    -- you may invite friends, or members of the session's group
    if not (public.are_friends(v_uid, v_invitee) or (v_group is not null and public.is_group_member(v_group, v_invitee))) then
      continue;
    end if;
    continue when public.is_blocked_between(v_uid, v_invitee);
    insert into public.session_invitations (session_id, user_id, invited_by) values (v_id, v_invitee, v_uid) on conflict do nothing;
    perform public.notify(v_invitee, 'session_invite', 'You''re invited: ' || trim(p ->> 'name'),
      v_host.display_name || ' invited you to play ' || v_format || '-a-side on ' || to_char(v_starts at time zone 'Europe/London', 'Dy DD Mon, HH24:MI') || '.',
      jsonb_build_object('session_id', v_id));
  end loop;

  for v_invitee in select (jsonb_array_elements_text(coalesce(p -> 'co_host_ids', '[]'::jsonb)))::uuid loop
    if public.are_friends(v_uid, v_invitee) or (v_group is not null and public.is_group_member(v_group, v_invitee)) then
      insert into public.session_hosts (session_id, user_id) values (v_id, v_invitee) on conflict do nothing;
    end if;
  end loop;

  perform public.log_audit('session.created', 'session', v_id, p - 'invitee_ids');
  return v_id;
end $$;

create or replace function public.update_session(p_session uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.sessions := public.require_session_manager(p_session);
  v_changed boolean;
  v_postcode text := case when p ? 'postcode' then public.normalise_postcode(p ->> 'postcode') else v.postcode end;
  v_lat double precision := case when p ? 'latitude' then nullif(p ->> 'latitude', '')::double precision else v.latitude end;
  v_lng double precision := case when p ? 'longitude' then nullif(p ->> 'longitude', '')::double precision else v.longitude end;
begin
  if p ? 'postcode' then perform public.check_session_place(v_postcode, v_lat, v_lng); end if;
  if v.status not in ('scheduled', 'in_progress') then
    perform public.raise_app_error('locked', 'This session can no longer be edited.');
  end if;
  if p ? 'payment_mode' and (p ->> 'payment_mode') <> v.payment_mode::text
     and exists (select 1 from public.payments where session_id = p_session and status in ('pending', 'authorised', 'paid')) then
    perform public.raise_app_error('locked', 'Payment settings cannot change once players have paid.');
  end if;
  if p ? 'max_attendance' and (p ->> 'max_attendance')::int <
     (select count(*) from public.session_attendance where session_id = p_session and status = 'confirmed') then
    perform public.raise_app_error('invalid', 'Maximum attendance cannot be lower than the number of confirmed players.');
  end if;
  v_changed := (p ? 'starts_at' and (p ->> 'starts_at')::timestamptz <> v.starts_at) or (p ? 'venue' and p ->> 'venue' is distinct from v.venue)
               or (p ? 'postcode' and v_postcode is distinct from v.postcode);

  update public.sessions set
    name = coalesce(trim(p ->> 'name'), name),
    starts_at = coalesce((p ->> 'starts_at')::timestamptz, starts_at),
    duration_minutes = coalesce((p ->> 'duration_minutes')::int, duration_minutes),
    location = case when p ? 'location' then p ->> 'location' else location end,
    venue = case when p ? 'venue' then p ->> 'venue' else venue end,
    postcode = v_postcode, latitude = v_lat, longitude = v_lng,
    format_size = coalesce((p ->> 'format_size')::int, format_size),
    max_attendance = coalesce((p ->> 'max_attendance')::int, max_attendance),
    visibility = coalesce((p ->> 'visibility')::public.session_visibility, visibility),
    description = case when p ? 'description' then p ->> 'description' else description end,
    payment_mode = coalesce((p ->> 'payment_mode')::public.payment_mode, payment_mode),
    price_pence = case when coalesce((p ->> 'payment_mode')::public.payment_mode, payment_mode) = 'free' then 0
                       else coalesce((p ->> 'price_pence')::int, price_pence) end,
    motm_mode = coalesce((p ->> 'motm_mode')::public.motm_mode, motm_mode),
    rsvp_deadline = case when p ? 'rsvp_deadline' then nullif(p ->> 'rsvp_deadline', '')::timestamptz else rsvp_deadline end
  where id = p_session;

  if v_changed then
    perform public.notify(a.user_id, 'session_updated', 'Session updated: ' || v.name, 'The kick-off time or venue has changed.',
      jsonb_build_object('session_id', p_session))
    from public.session_attendance a where a.session_id = p_session and a.status in ('confirmed', 'waitlisted') and a.user_id <> auth.uid();
  end if;
  perform public.log_audit('session.updated', 'session', p_session, p);
end $$;

create or replace function public.save_session_as_template(p_session uuid, p_name text, p_recurrence public.recurrence default 'weekly', p_auto boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_id uuid;
begin
  insert into public.session_templates (owner_id, group_id, name, format_size, location, venue, postcode, latitude, longitude, max_attendance, visibility, description,
    payment_mode, price_pence, recurrence, start_time, duration_minutes, invitee_ids, auto_schedule)
  select auth.uid(), v.group_id, coalesce(nullif(trim(p_name), ''), v.name), v.format_size, v.location, v.venue, v.postcode, v.latitude, v.longitude, v.max_attendance,
         v.visibility, v.description, v.payment_mode, v.price_pence, p_recurrence,
         (v.starts_at at time zone 'Europe/London')::time, v.duration_minutes,
         coalesce(array(select user_id from public.session_attendance where session_id = p_session and status = 'confirmed' and user_id <> auth.uid()), '{}'),
         p_auto
  returning id into v_id;
  update public.sessions set template_id = v_id where id = p_session;
  return v_id;
end $$;

create or replace function public.create_session_from_template(p_template uuid, p_date date, p_actor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.session_templates; v_actor uuid := coalesce(auth.uid(), p_actor);
begin
  select * into t from public.session_templates where id = p_template;
  if t.id is null or t.owner_id <> v_actor then perform public.raise_app_error('not_found', 'Template not found.'); end if;
  if auth.uid() is null then
    -- invoked by the scheduler: impersonate the template owner for validation
    perform set_config('request.jwt.claims', jsonb_build_object('sub', t.owner_id, 'role', 'authenticated')::text, true);
  end if;
  return public.create_session(jsonb_build_object(
    'name', t.name, 'group_id', t.group_id, 'template_id', t.id,
    'starts_at', ((p_date + t.start_time) at time zone 'Europe/London'),
    'duration_minutes', t.duration_minutes, 'location', t.location, 'venue', t.venue, 'postcode', t.postcode, 'latitude', t.latitude, 'longitude', t.longitude, 'format_size', t.format_size,
    'max_attendance', t.max_attendance, 'visibility', t.visibility, 'description', t.description,
    'payment_mode', t.payment_mode, 'price_pence', t.price_pence, 'invitee_ids', to_jsonb(t.invitee_ids)
  ));
end $$;
revoke execute on function public.create_session_from_template(uuid, date, uuid) from anon;

create or replace function public.duplicate_session(p_session uuid, p_starts_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.session_or_error(p_session);
begin
  if not public.is_session_manager(p_session, public.require_user()) then
    perform public.raise_app_error('forbidden', 'Only the host can repeat this session.');
  end if;
  return public.create_session(jsonb_build_object(
    'name', v.name, 'group_id', v.group_id, 'template_id', v.template_id, 'starts_at', p_starts_at,
    'duration_minutes', v.duration_minutes, 'location', v.location, 'venue', v.venue, 'postcode', v.postcode, 'latitude', v.latitude, 'longitude', v.longitude, 'format_size', v.format_size,
    'max_attendance', v.max_attendance, 'visibility', v.visibility, 'description', v.description,
    'payment_mode', v.payment_mode, 'price_pence', v.price_pence, 'motm_mode', v.motm_mode,
    'invitee_ids', coalesce((select jsonb_agg(user_id) from (
        select user_id from public.session_invitations where session_id = p_session
        union select user_id from public.session_attendance where session_id = p_session and status = 'confirmed') x), '[]'::jsonb)
  ));
end $$;

drop function if exists public.search_public_sessions(text, timestamptz, timestamptz, int, boolean, int);
create or replace function public.search_public_sessions(
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_format int default null,
  p_free_only boolean default false,
  p_limit int default 40,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles double precision default null
) returns table (
  id uuid, name text, starts_at timestamptz, duration_minutes int, venue text, location text,
  format_size int, max_attendance int, confirmed int, price_pence int, payment_mode public.payment_mode,
  host_id uuid, host_name text, host_avatar text, my_status public.rsvp_status,
  postcode text, distance_miles double precision
) language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.starts_at, s.duration_minutes, s.venue, s.location,
         s.format_size, s.max_attendance, public.confirmed_count(s.id), s.price_pence, s.payment_mode,
         s.host_id, h.display_name, h.avatar_url,
         (select a.status from public.session_attendance a where a.session_id = s.id and a.user_id = auth.uid()),
         s.postcode, d.miles
    from public.sessions s
    cross join lateral (select public.miles_between(p_lat, p_lng, s.latitude, s.longitude) as miles) d
    left join public.profiles h on h.id = s.host_id
   where auth.uid() is not null
     and s.visibility = 'public'
     and s.status = 'scheduled'
     and s.starts_at > now()
     and (p_from is null or s.starts_at >= p_from)
     and (p_to is null or s.starts_at < p_to)
     and (p_format is null or (p_format >= 8 and s.format_size >= 8) or s.format_size = p_format)
     and (not coalesce(p_free_only, false) or s.payment_mode = 'free')
     -- every word must appear somewhere in the name, venue or area, in any order:
     -- "mill hill powerleague", "powerleague" and "mill hill" all find "Powerleague Mill Hill"
     and not exists (
       select 1 from unnest(regexp_split_to_array(lower(trim(coalesce(p_query, ''))), '\s+')) w
        where w <> '' and position(w in lower(coalesce(s.name, '') || ' ' || coalesce(s.venue, '') || ' ' || coalesce(s.location, ''))) = 0
     )
     and (s.host_id is null or not public.is_blocked_between(s.host_id, auth.uid()))
     -- near a place: only games with a postcode inside the radius
     and (p_lat is null or p_lng is null or (d.miles is not null and d.miles <= coalesce(p_radius_miles, 5)))
   order by s.starts_at
   limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;
grant execute on function public.search_public_sessions(text, timestamptz, timestamptz, int, boolean, int, double precision, double precision, double precision) to authenticated;
