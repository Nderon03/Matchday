-- Remember why a player was removed (shown to them), and optionally remove the
-- guests they brought when the host removes them.
alter table public.session_attendance add column removed_reason text check (removed_reason is null or char_length(removed_reason) <= 200);
alter table public.session_attendance add column removed_at timestamptz;

drop function if exists public.remove_session_player(uuid, uuid, text);

create or replace function public.remove_session_player(p_session uuid, p_user uuid, p_reason text default null, p_remove_guests boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session); v_prev public.rsvp_status; v_guests int := 0; v_g record;
begin
  if v.status not in ('scheduled', 'in_progress') then
    perform public.raise_app_error('locked', 'Players can only be removed before the session is completed.');
  end if;
  if p_user = v.host_id then perform public.raise_app_error('invalid', 'The host cannot be removed.'); end if;
  select status into v_prev from public.session_attendance where session_id = p_session and user_id = p_user for update;
  if v_prev is null and not exists (select 1 from public.session_invitations where session_id = p_session and user_id = p_user) then
    perform public.raise_app_error('not_found', 'That player is not on this session.');
  end if;
  insert into public.session_attendance (session_id, user_id, status)
  values (p_session, p_user, 'removed')
  on conflict (session_id, user_id) do update set status = 'removed', waitlisted_at = null, checked_in_at = null,
    verification = 'unverified', responded_at = now();
  update public.session_attendance set removed_reason = nullif(trim(p_reason), ''), removed_at = now()
   where session_id = p_session and user_id = p_user;
  -- optionally take the guests they brought with them
  if p_remove_guests then
    for v_g in select id from public.session_guests where session_id = p_session and added_by = p_user and status in ('confirmed', 'pending') loop
      update public.session_guests set status = 'removed', decided_by = auth.uid(), decided_at = now() where id = v_g.id;
      delete from public.team_players tp using public.fixtures f where tp.fixture_id = f.id and f.played = false and tp.guest_id = v_g.id;
      v_guests := v_guests + 1;
    end loop;
  end if;
  delete from public.session_invitations where session_id = p_session and user_id = p_user;
  delete from public.session_hosts where session_id = p_session and user_id = p_user;
  delete from public.team_players tp using public.fixtures f
   where tp.fixture_id = f.id and f.session_id = p_session and f.played = false and tp.user_id = p_user;
  if v_prev = 'confirmed' or v_guests > 0 then
    loop
      exit when public.promote_from_waitlist(p_session) is null;
    end loop;
  end if;
  perform public.notify(p_user, 'session_removed', 'Removed from ' || v.name,
    coalesce('Reason: ' || nullif(trim(p_reason), '') || '. ', '') || 'You can rejoin if the host invites you again.'
      || case when v_guests > 0 then ' Your guest' || case when v_guests > 1 then 's were' else ' was' end || ' removed too.' else '' end,
    jsonb_build_object('session_id', p_session, 'session_name', v.name, 'reason', nullif(trim(p_reason), '')));
  perform public.log_audit('attendance.removed', 'session', p_session, jsonb_build_object('user_id', p_user, 'reason', p_reason, 'guests_removed', v_guests));
end $$;
