-- 1. Link previews: what WhatsApp & co. show when an invite link is shared. Anyone with the
--    link can call this (it only returns a short public summary, never who's playing).
-- 2. Calendar feed: a private subscription link per player that lists their games and keeps
--    Google/Apple Calendar up to date (served by the calendar-feed Edge Function).

create or replace function public.get_link_preview(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.invite_links; r jsonb;
begin
  select * into v from public.invite_links where code = p_code;
  if v.code is null or (v.expires_at is not null and v.expires_at < now()) or (v.max_uses is not null and v.uses >= v.max_uses) then
    return null;
  end if;
  if v.kind = 'session' then
    select jsonb_build_object('kind', 'session', 'name', s.name, 'starts_at', s.starts_at, 'venue', s.venue, 'area', coalesce(s.location, s.postcode),
             'format_size', s.format_size, 'status', s.status, 'price_pence', case when s.payment_mode = 'free' then 0 else s.price_pence end,
             'places_left', greatest(0, s.max_attendance - public.confirmed_count(s.id)))
      into r from public.sessions s where s.id = v.target_id;
  elsif v.kind = 'group' then
    select jsonb_build_object('kind', 'group', 'name', g.name, 'area', g.location,
             'members', (select count(*) from public.group_members m where m.group_id = g.id))
      into r from public.groups g where g.id = v.target_id;
  else
    select jsonb_build_object('kind', 'friend', 'name', p.display_name) into r from public.profiles p where p.id = v.target_id;
  end if;
  return r;
end $$;
grant execute on function public.get_link_preview(text) to anon, authenticated;

create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;

-- My private calendar link token (created the first time). p_reset gives a new one, so an old
-- link that was shared by mistake stops working.
create or replace function public.get_calendar_feed(p_reset boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_token text;
begin
  if p_reset then delete from public.calendar_feeds where user_id = v_uid; end if;
  insert into public.calendar_feeds (user_id) values (v_uid) on conflict (user_id) do nothing;
  select token into v_token from public.calendar_feeds where user_id = v_uid;
  return v_token;
end $$;
grant execute on function public.get_calendar_feed(boolean) to authenticated;

-- The games behind a feed token (service role only): ones I'm playing in, waiting for, invited
-- to or hosting, from 60 days ago onwards. Cancelled games are left out so they disappear.
create or replace function public.calendar_feed_events(p_token text)
returns table (session_id uuid, name text, starts_at timestamptz, duration_minutes int, venue text, area text, postcode text,
               status text, my_status text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select user_id from public.calendar_feeds where token = p_token)
  select s.id, s.name, s.starts_at, s.duration_minutes, s.venue, s.location, s.postcode, s.status::text,
         case when s.host_id = me.user_id then 'host' else coalesce(a.status::text, 'invited') end,
         coalesce(s.updated_at, s.created_at)
    from me
    join public.sessions s on true
    left join public.session_attendance a on a.session_id = s.id and a.user_id = me.user_id
   where s.status <> 'cancelled'
     and s.starts_at > now() - interval '60 days'
     and (s.host_id = me.user_id
          or a.status in ('confirmed', 'waitlisted')
          or (a.status is null and exists (select 1 from public.session_invitations i where i.session_id = s.id and i.user_id = me.user_id)))
   order by s.starts_at;
$$;
revoke execute on function public.calendar_feed_events(text) from public, anon, authenticated;
