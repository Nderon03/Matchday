-- "Find a game": search upcoming Public sessions by name, venue or area, with simple filters.
-- Text search only (venue/area as typed by the host); no location tracking.
create or replace function public.search_public_sessions(
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_format int default null,
  p_free_only boolean default false,
  p_limit int default 40
) returns table (
  id uuid, name text, starts_at timestamptz, duration_minutes int, venue text, location text,
  format_size int, max_attendance int, confirmed int, price_pence int, payment_mode public.payment_mode,
  host_id uuid, host_name text, host_avatar text, my_status public.rsvp_status
) language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.starts_at, s.duration_minutes, s.venue, s.location,
         s.format_size, s.max_attendance, public.confirmed_count(s.id), s.price_pence, s.payment_mode,
         s.host_id, h.display_name, h.avatar_url,
         (select a.status from public.session_attendance a where a.session_id = s.id and a.user_id = auth.uid())
    from public.sessions s
    left join public.profiles h on h.id = s.host_id
   where auth.uid() is not null
     and s.visibility = 'public'
     and s.status = 'scheduled'
     and s.starts_at > now()
     and (p_from is null or s.starts_at >= p_from)
     and (p_to is null or s.starts_at < p_to)
     and (p_format is null or (p_format >= 8 and s.format_size >= 8) or s.format_size = p_format)
     and (not coalesce(p_free_only, false) or s.payment_mode = 'free')
     and (coalesce(trim(p_query), '') = ''
          or s.name ilike '%' || trim(p_query) || '%'
          or s.venue ilike '%' || trim(p_query) || '%'
          or s.location ilike '%' || trim(p_query) || '%')
     and (s.host_id is null or not public.is_blocked_between(s.host_id, auth.uid()))
   order by s.starts_at
   limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;
grant execute on function public.search_public_sessions(text, timestamptz, timestamptz, int, boolean, int) to authenticated;
create index if not exists sessions_public_upcoming_idx on public.sessions (starts_at) where visibility = 'public' and status = 'scheduled';
