-- 1. No more repeating games: presets only. Existing repeats are switched off and new presets
--    can't repeat (the nightly job only creates games for templates with auto_schedule on).
update public.session_templates set auto_schedule = false, recurrence = 'none' where auto_schedule or recurrence <> 'none';

create or replace function public.templates_no_repeat()
returns trigger language plpgsql set search_path = public as $$
begin
  new.auto_schedule := false;
  new.recurrence := 'none';
  return new;
end $$;

drop trigger if exists templates_no_repeat on public.session_templates;
create trigger templates_no_repeat before insert or update on public.session_templates
  for each row execute function public.templates_no_repeat();

-- 2. After the 24-hour cut-off a player can tell the host they can't come with one tap.
--    The host sees it on the game and lets them drop out (release_session_player).
alter table public.session_attendance add column if not exists dropout_requested_at timestamptz;

create or replace function public.request_dropout(p_session uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v public.sessions := public.session_or_error(p_session, true);
  v_att public.session_attendance;
  v_name text;
  v_mgr uuid;
begin
  if v.status <> 'scheduled' then perform public.raise_app_error('locked', 'This session has already started.'); end if;
  select * into v_att from public.session_attendance where session_id = p_session and user_id = v_uid;
  if v_att.status is distinct from 'confirmed' then perform public.raise_app_error('invalid', 'You’re not in the squad for this game.'); end if;
  if v_att.dropout_requested_at is not null then return; end if;
  update public.session_attendance set dropout_requested_at = now() where session_id = p_session and user_id = v_uid;
  select display_name into v_name from public.profiles where id = v_uid;
  for v_mgr in
    select v.host_id where v.host_id is not null
    union select user_id from public.session_hosts where session_id = p_session
  loop
    if v_mgr <> v_uid then
      perform public.notify(v_mgr, 'dropout_request', v_name || ' can’t make ' || v.name,
        coalesce('“' || left(nullif(trim(p_message), ''), 200) || '” ', '') || 'Open the game to let them drop out so the next player gets the place.',
        jsonb_build_object('session_id', p_session, 'session_name', v.name, 'user_id', v_uid));
    end if;
  end loop;
end $$;

revoke execute on function public.request_dropout(uuid, text) from public, anon;
grant execute on function public.request_dropout(uuid, text) to authenticated;

-- a request is cleared once they leave the squad (or the host lets them go)
create or replace function public.attendance_clear_dropout_request()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> 'confirmed' then new.dropout_requested_at := null; end if;
  return new;
end $$;

drop trigger if exists attendance_clear_dropout_request on public.session_attendance;
create trigger attendance_clear_dropout_request before update of status on public.session_attendance
  for each row execute function public.attendance_clear_dropout_request();
