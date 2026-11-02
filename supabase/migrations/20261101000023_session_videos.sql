-- Match videos: hosts can link YouTube videos of a session (up to 5), shown on the session page.
-- Only YouTube is accepted and only the 11-character video id is stored, so nothing else can be linked.

create or replace function public.youtube_video_id(p_url text)
returns text language plpgsql immutable set search_path = public as $$
declare u text := trim(coalesce(p_url, '')); m text[];
begin
  if u = '' or length(u) > 300 then return null; end if;
  m := regexp_match(u, '^(?:https?://)?(?:(?:www|m|music)\.)?youtu\.be/([A-Za-z0-9_-]{11})(?:[?&#/].*)?$', 'i');
  if m is null then
    m := regexp_match(u, '^(?:https?://)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com)/(?:shorts|live|embed)/([A-Za-z0-9_-]{11})(?:[?&#/].*)?$', 'i');
  end if;
  if m is null then
    m := regexp_match(u, '^(?:https?://)?(?:(?:www|m|music)\.)?youtube\.com/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$', 'i');
  end if;
  return m[1];
end $$;

create table public.session_videos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text check (title is null or char_length(title) between 1 and 60),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, video_id)
);
create index session_videos_session_idx on public.session_videos (session_id, created_at);
alter table public.session_videos enable row level security;
create policy session_videos_select on public.session_videos for select to authenticated using (public.can_view_session(session_id));
grant select on public.session_videos to authenticated;

create or replace function public.add_session_video(p_session uuid, p_url text, p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.sessions := public.require_session_manager(p_session);
  v_vid text := public.youtube_video_id(p_url);
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_id uuid;
begin
  perform public.check_rate_limit('add_video', 30, interval '1 hour');
  if v.status = 'cancelled' then perform public.raise_app_error('locked', 'This session was cancelled.'); end if;
  if v.status = 'scheduled' and v.starts_at > now() then
    perform public.raise_app_error('not_started', 'You can add a video once the session has kicked off.');
  end if;
  if v_vid is null then perform public.raise_app_error('invalid_video', 'Paste a YouTube link (youtube.com or youtu.be).'); end if;
  if char_length(coalesce(v_title, '')) > 60 then perform public.raise_app_error('invalid', 'Keep the label under 60 characters.'); end if;
  if exists (select 1 from public.session_videos where session_id = p_session and video_id = v_vid) then
    perform public.raise_app_error('duplicate', 'That video is already added.');
  end if;
  if (select count(*) from public.session_videos where session_id = p_session) >= 5 then
    perform public.raise_app_error('video_limit', 'A session can have up to 5 videos.');
  end if;
  insert into public.session_videos (session_id, video_id, title, added_by)
  values (p_session, v_vid, v_title, auth.uid()) returning id into v_id;

  perform public.notify(a.user_id, 'session_video', '🎥 Video of ' || v.name || ' is up',
    coalesce(v_title || ' — ', '') || 'Watch the game back in MATCHDAY.', jsonb_build_object('session_id', p_session))
  from public.session_attendance a
  where a.session_id = p_session and a.user_id <> auth.uid()
    and (a.verification = 'verified' or (a.status = 'confirmed' and a.verification = 'unverified'));
  perform public.log_audit('video.added', 'session', p_session, jsonb_build_object('video_id', v_vid));
  return v_id;
end $$;

create or replace function public.remove_session_video(p_video uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.session_videos;
begin
  select * into r from public.session_videos where id = p_video;
  if r.id is null then perform public.raise_app_error('not_found', 'Video not found.'); end if;
  perform public.require_session_manager(r.session_id);
  delete from public.session_videos where id = p_video;
  perform public.log_audit('video.removed', 'session', r.session_id, jsonb_build_object('video_id', r.video_id));
end $$;

grant execute on function public.add_session_video(uuid, text, text) to authenticated;
grant execute on function public.remove_session_video(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.session_videos;
  end if;
end $$;
