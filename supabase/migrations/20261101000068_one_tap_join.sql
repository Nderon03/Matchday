-- Faster joining from a WhatsApp link.
--  * A group game's link shared by the host also adds the player to the group (when the host is a
--    group admin, or the group is open), so one link gets a new player into the game and the squad.
--  * join_via_invite: accept the link and say "I'm in" in one go (the invite page's one-tap button).
create or replace function public.accept_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.invite_links; v_result text; v_group uuid; v_joined_group boolean := false;
begin
  select * into v from public.invite_links where code = p_code for update;
  if v.code is null or (v.expires_at is not null and v.expires_at < now()) or (v.max_uses is not null and v.uses >= v.max_uses) then
    perform public.raise_app_error('invite_expired', 'This invitation has expired or is no longer valid.');
  end if;
  if v.kind = 'friend' then
    if v.target_id = v_uid then return jsonb_build_object('kind', 'friend', 'result', 'self'); end if;
    if public.is_blocked_between(v_uid, v.target_id) then perform public.raise_app_error('blocked', 'This invite is not available.'); end if;
    insert into public.friendships (user_a, user_b) values (least(v_uid, v.target_id), greatest(v_uid, v.target_id)) on conflict do nothing;
    update public.friend_requests set status = 'accepted', responded_at = now()
     where status = 'pending' and least(sender_id, receiver_id) = least(v_uid, v.target_id) and greatest(sender_id, receiver_id) = greatest(v_uid, v.target_id);
    perform public.notify(v.target_id, 'friend_accepted', 'New friend', (select display_name from public.profiles where id = v_uid) || ' added you via your invite link.', jsonb_build_object('user_id', v_uid));
    v_result := 'friends';
  elsif v.kind = 'group' then
    if public.is_removed_from_group(v.target_id, v_uid) then
      perform public.raise_app_error('removed', 'An admin removed you from this group. You can only rejoin if an admin adds you back.');
    end if;
    insert into public.group_members (group_id, user_id) values (v.target_id, v_uid) on conflict do nothing;
    v_result := 'joined';
  else
    if exists (select 1 from public.session_attendance where session_id = v.target_id and user_id = v_uid and status = 'removed') then
      perform public.raise_app_error('removed', 'The host removed you from this session. Ask them to invite you again.');
    end if;
    -- a link a player shared stops working if the host switched "bring a mate" off (closed games)
    if v.created_by is not null and not public.is_session_manager(v.target_id, v.created_by)
       and not exists (select 1 from public.sessions s where s.id = v.target_id and (s.visibility = 'public' or s.players_can_invite)) then
      perform public.raise_app_error('invite_expired', 'The host has turned off joining through players’ links for this game.');
    end if;
    insert into public.session_invitations (session_id, user_id, invited_by) values (v.target_id, v_uid, v.created_by) on conflict do nothing;
    -- one link does it all: a group game's link from the host (a group admin, or anyone in an open
    -- group) also brings the player into the group, so the squad never needs a second link
    select group_id into v_group from public.sessions where id = v.target_id;
    if v_group is not null and v.created_by is not null and not public.is_group_member(v_group, v_uid)
       and not public.is_removed_from_group(v_group, v_uid)
       and (public.is_group_admin(v_group, v.created_by)
            or (public.is_session_manager(v.target_id, v.created_by) and exists (select 1 from public.groups g where g.id = v_group and g.join_policy = 'open'))) then
      insert into public.group_members (group_id, user_id) values (v_group, v_uid) on conflict do nothing;
      v_joined_group := true;
    end if;
    -- tell the player who brought them
    if v.created_by is not null and v.created_by <> v_uid and not public.is_session_manager(v.target_id, v.created_by) then
      perform public.notify(v.created_by, 'mate_joined', (select display_name from public.profiles where id = v_uid) || ' is on MATCHDAY',
        'They opened your link for ' || (select name from public.sessions where id = v.target_id) || '. Once they tap “I’m in”, they’re playing.',
        jsonb_build_object('session_id', v.target_id, 'user_id', v_uid));
    end if;
    v_result := 'invited';
  end if;
  update public.invite_links set uses = uses + 1 where code = p_code;
  return jsonb_build_object('kind', v.kind, 'target_id', v.target_id, 'result', v_result, 'joined_group', v_joined_group);
end $$;


create or replace function public.join_via_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_status public.rsvp_status;
begin
  r := public.accept_invite(p_code);
  if r->>'kind' <> 'session' then return r; end if;
  v_status := public.respond_to_session((r->>'target_id')::uuid, 'confirmed');
  return r || jsonb_build_object('status', v_status);
end $$;
grant execute on function public.join_via_invite(text) to authenticated;
