-- Notifications, friends, blocking, invites, moderation and group management RPCs.

-- ---------------------------------------------------------------------------
-- Notifications & activity
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_body text default '', p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prefs public.user_preferences;
  v_push text := 'skipped';
  v_email text := 'skipped';
begin
  if p_user is null then return; end if;
  select * into v_prefs from public.user_preferences where user_id = p_user;
  if v_prefs.user_id is not null and coalesce((v_prefs.notification_prefs ->> p_type)::boolean, true) = false then
    return;
  end if;
  if coalesce(v_prefs.push_enabled, true) and exists (select 1 from public.push_tokens where user_id = p_user) then
    v_push := 'queued';
  end if;
  if coalesce(v_prefs.email_enabled, true)
     and p_type in ('session_invite', 'payment_required', 'payment_confirmed', 'payment_failed', 'waitlist_promoted') then
    v_email := 'queued';
  end if;
  insert into public.notifications (user_id, type, title, body, data, push_status, email_status)
  values (p_user, p_type, p_title, coalesce(p_body, ''), coalesce(p_data, '{}'::jsonb), v_push, v_email);
end $$;

create or replace function public.post_activity(
  p_actor uuid, p_type text, p_payload jsonb, p_group uuid default null, p_session uuid default null
) returns uuid language sql security definer set search_path = public as $$
  insert into public.activity_feed (actor_id, type, payload, group_id, session_id)
  values (p_actor, p_type, coalesce(p_payload, '{}'::jsonb), p_group, p_session)
  returning id;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  if p_token is null or char_length(p_token) < 10 then
    perform public.raise_app_error('invalid_token', 'Invalid push token.');
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Profiles & usernames
-- ---------------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_username ~ '^[a-zA-Z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = p_username::citext and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid));
$$;

create or replace function public.complete_onboarding(p_username text, p_display_name text, p_position public.player_position)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_row public.profiles;
begin
  if not public.is_username_available(p_username) then
    perform public.raise_app_error('username_taken', 'That username is not available.');
  end if;
  update public.profiles
     set username = p_username, display_name = trim(p_display_name), position = p_position, onboarded = true
   where id = v_uid returning * into v_row;
  return v_row;
end $$;

create or replace function public.search_users(p_query text, p_limit int default 20)
returns table (
  id uuid, username citext, display_name text, avatar_url text, "position" public.player_position,
  is_friend boolean, request_pending boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.position,
         public.are_friends(p.id, auth.uid()),
         exists (select 1 from public.friend_requests r where r.status = 'pending'
                  and ((r.sender_id = auth.uid() and r.receiver_id = p.id) or (r.sender_id = p.id and r.receiver_id = auth.uid())))
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and char_length(trim(p_query)) >= 2
    and (p.username ilike trim(p_query) || '%' or p.display_name ilike '%' || trim(p_query) || '%')
    and not public.is_blocked_between(p.id, auth.uid())
  order by (p.username ilike trim(p_query) || '%') desc, p.username
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Friends & blocking
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_existing public.friend_requests; v_me public.profiles;
begin
  perform public.check_rate_limit('friend_request', 30, interval '1 hour');
  if p_target = v_uid then perform public.raise_app_error('invalid', 'You cannot add yourself.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    perform public.raise_app_error('not_found', 'Player not found.');
  end if;
  if public.is_blocked_between(v_uid, p_target) then
    perform public.raise_app_error('blocked', 'You cannot send a request to this player.');
  end if;
  if public.are_friends(v_uid, p_target) then return 'already_friends'; end if;

  select * into v_existing from public.friend_requests
   where status = 'pending' and ((sender_id = p_target and receiver_id = v_uid) or (sender_id = v_uid and receiver_id = p_target));
  if v_existing.id is not null then
    if v_existing.sender_id = p_target then
      -- they already asked us: accept instead of creating a duplicate
      perform public.respond_friend_request(v_existing.id, true);
      return 'accepted';
    end if;
    return 'already_pending';
  end if;

  insert into public.friend_requests (sender_id, receiver_id) values (v_uid, p_target);
  select * into v_me from public.profiles where id = v_uid;
  perform public.notify(p_target, 'friend_request', 'New friend request',
    v_me.display_name || ' (@' || v_me.username || ') wants to be friends.', jsonb_build_object('user_id', v_uid));
  return 'sent';
end $$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_req public.friend_requests; v_me public.profiles;
begin
  select * into v_req from public.friend_requests where id = p_request for update;
  if v_req.id is null or v_req.receiver_id <> v_uid then
    perform public.raise_app_error('not_found', 'Friend request not found.');
  end if;
  if v_req.status <> 'pending' then
    perform public.raise_app_error('already_handled', 'This request has already been handled.');
  end if;
  update public.friend_requests set status = case when p_accept then 'accepted' else 'rejected' end::public.request_status,
         responded_at = now() where id = p_request;
  if p_accept then
    insert into public.friendships (user_a, user_b)
    values (least(v_req.sender_id, v_req.receiver_id), greatest(v_req.sender_id, v_req.receiver_id))
    on conflict do nothing;
    select * into v_me from public.profiles where id = v_uid;
    perform public.notify(v_req.sender_id, 'friend_accepted', 'Friend request accepted',
      v_me.display_name || ' accepted your friend request.', jsonb_build_object('user_id', v_uid));
  end if;
end $$;

create or replace function public.cancel_friend_request(p_request uuid)
returns void language sql security definer set search_path = public as $$
  update public.friend_requests set status = 'cancelled', responded_at = now()
  where id = p_request and sender_id = auth.uid() and status = 'pending';
$$;

create or replace function public.remove_friend(p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.friendships where user_a = least(auth.uid(), p_user) and user_b = greatest(auth.uid(), p_user);
$$;

create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  if p_user = v_uid then perform public.raise_app_error('invalid', 'You cannot block yourself.'); end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, p_user) on conflict do nothing;
  delete from public.friendships where user_a = least(v_uid, p_user) and user_b = greatest(v_uid, p_user);
  update public.friend_requests set status = 'cancelled', responded_at = now()
   where status = 'pending' and ((sender_id = v_uid and receiver_id = p_user) or (sender_id = p_user and receiver_id = v_uid));
end $$;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create or replace function public.create_group(
  p_name text, p_description text default null, p_visibility public.group_visibility default 'private',
  p_join_policy public.group_join_policy default 'request', p_location text default null, p_rules text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_id uuid;
begin
  perform public.check_rate_limit('create_group', 10, interval '1 day');
  insert into public.groups (name, description, visibility, join_policy, location, rules, created_by)
  values (trim(p_name), p_description, p_visibility, p_join_policy, p_location, p_rules, v_uid)
  returning id into v_id;
  perform public.log_audit('group.created', 'group', v_id, jsonb_build_object('name', p_name));
  perform public.post_activity(v_uid, 'group_created', jsonb_build_object('group_name', p_name), v_id);
  return v_id;
end $$;

create or replace function public.join_group(p_group uuid, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_group public.groups; v_admin record; v_me public.profiles;
begin
  select * into v_group from public.groups where id = p_group;
  if v_group.id is null or (v_group.visibility = 'private' and v_group.join_policy <> 'request') then
    perform public.raise_app_error('not_found', 'Group not found.');
  end if;
  if public.is_group_member(p_group, v_uid) then return 'already_member'; end if;
  if v_group.join_policy = 'invite_only' then
    perform public.raise_app_error('invite_only', 'This group is invitation-only. Ask an admin for an invite link.');
  end if;
  if v_group.join_policy = 'open' then
    insert into public.group_members (group_id, user_id) values (p_group, v_uid);
    perform public.log_audit('group.joined', 'group', p_group);
    return 'joined';
  end if;
  insert into public.group_join_requests (group_id, user_id, message) values (p_group, v_uid, p_message)
  on conflict do nothing;
  select * into v_me from public.profiles where id = v_uid;
  for v_admin in select user_id from public.group_members where group_id = p_group and role in ('owner', 'admin') loop
    perform public.notify(v_admin.user_id, 'group_join_request', 'Join request',
      v_me.display_name || ' wants to join ' || v_group.name || '.', jsonb_build_object('group_id', p_group));
  end loop;
  return 'requested';
end $$;

create or replace function public.decide_join_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_req public.group_join_requests; v_name text;
begin
  select * into v_req from public.group_join_requests where id = p_request for update;
  if v_req.id is null or not public.is_group_admin(v_req.group_id, v_uid) then
    perform public.raise_app_error('forbidden', 'You do not have permission to manage this group.');
  end if;
  if v_req.status <> 'pending' then perform public.raise_app_error('already_handled', 'Request already handled.'); end if;
  update public.group_join_requests
     set status = case when p_approve then 'accepted' else 'rejected' end::public.request_status, decided_by = v_uid, decided_at = now()
   where id = p_request;
  select name into v_name from public.groups where id = v_req.group_id;
  if p_approve then
    insert into public.group_members (group_id, user_id) values (v_req.group_id, v_req.user_id) on conflict do nothing;
    perform public.notify(v_req.user_id, 'group_join_approved', 'Welcome to ' || v_name, 'Your request to join was approved.',
      jsonb_build_object('group_id', v_req.group_id));
  end if;
  perform public.log_audit(case when p_approve then 'group.request_approved' else 'group.request_rejected' end,
    'group', v_req.group_id, jsonb_build_object('user_id', v_req.user_id));
end $$;

create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role public.group_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_my public.group_role; v_their public.group_role;
begin
  v_my := public.group_role_of(p_group, v_uid);
  v_their := public.group_role_of(p_group, p_user);
  if v_their is null then perform public.raise_app_error('not_found', 'Member not found.'); end if;
  if p_role = 'owner' then perform public.raise_app_error('invalid', 'Use ownership transfer instead.'); end if;
  if v_their = 'owner' then perform public.raise_app_error('forbidden', 'The owner''s role cannot be changed.'); end if;
  if not (v_my = 'owner' or (v_my = 'admin' and p_role in ('moderator', 'member') and v_their in ('moderator', 'member'))) then
    perform public.raise_app_error('forbidden', 'You do not have permission to change this role.');
  end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
  perform public.log_audit('group.role_changed', 'group', p_group, jsonb_build_object('user_id', p_user, 'role', p_role));
end $$;

create or replace function public.transfer_group_ownership(p_group uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  if public.group_role_of(p_group, v_uid) <> 'owner' then
    perform public.raise_app_error('forbidden', 'Only the owner can transfer ownership.');
  end if;
  if not public.is_group_member(p_group, p_new_owner) then
    perform public.raise_app_error('not_found', 'The new owner must be a member.');
  end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = v_uid;
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_new_owner;
  perform public.log_audit('group.ownership_transferred', 'group', p_group, jsonb_build_object('to', p_new_owner));
end $$;

create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_my public.group_role; v_their public.group_role;
begin
  v_my := public.group_role_of(p_group, v_uid);
  v_their := public.group_role_of(p_group, p_user);
  if p_user = v_uid then
    if v_their = 'owner' then
      perform public.raise_app_error('owner_cannot_leave', 'Transfer ownership before leaving the group.');
    end if;
  elsif not (v_my = 'owner' or (v_my = 'admin' and v_their in ('moderator', 'member'))) then
    perform public.raise_app_error('forbidden', 'You do not have permission to remove this member.');
  end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  perform public.log_audit('group.member_removed', 'group', p_group, jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.create_season(p_group uuid, p_name text, p_starts date, p_ends date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_id uuid; v_gname text;
begin
  if not public.is_group_admin(p_group, v_uid) then
    perform public.raise_app_error('forbidden', 'Only group admins can create seasons.');
  end if;
  if exists (select 1 from public.seasons where group_id = p_group and daterange(starts_on, ends_on, '[]') && daterange(p_starts, p_ends, '[]')) then
    perform public.raise_app_error('season_overlap', 'Seasons in a group cannot overlap.');
  end if;
  insert into public.seasons (group_id, name, starts_on, ends_on) values (p_group, p_name, p_starts, p_ends) returning id into v_id;
  -- backfill already-finalised sessions in range (career history is never touched)
  update public.sessions set season_id = v_id
   where group_id = p_group and status = 'finalised' and starts_at::date between p_starts and p_ends;
  update public.session_player_statistics sps set season_id = v_id
    from public.sessions s where s.id = sps.session_id and s.season_id = v_id;
  select name into v_gname from public.groups where id = p_group;
  perform public.post_activity(v_uid, 'season_started', jsonb_build_object('season_name', p_name, 'group_name', v_gname), p_group);
  perform public.notify(m.user_id, 'season_started', 'New season: ' || p_name, v_gname || ' has started a new season.',
    jsonb_build_object('group_id', p_group, 'season_id', v_id))
    from public.group_members m where m.group_id = p_group and m.user_id <> v_uid;
  perform public.log_audit('season.created', 'season', v_id, jsonb_build_object('group_id', p_group));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Invite links (friend / group / session) and QR codes
-- ---------------------------------------------------------------------------
create or replace function public.create_invite_link(p_kind text, p_target uuid default null, p_expires_hours int default 168)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_code text; v_target uuid := coalesce(p_target, v_uid);
begin
  perform public.check_rate_limit('invite_link', 50, interval '1 hour');
  if p_kind = 'friend' then
    v_target := v_uid;
  elsif p_kind = 'group' then
    if not public.is_group_admin(v_target, v_uid)
       and not (public.is_group_member(v_target, v_uid) and (select join_policy from public.groups where id = v_target) <> 'invite_only') then
      perform public.raise_app_error('forbidden', 'You cannot invite people to this group.');
    end if;
  elsif p_kind = 'session' then
    if not public.is_session_manager(v_target, v_uid) then
      perform public.raise_app_error('forbidden', 'Only hosts can share session invite links.');
    end if;
  else
    perform public.raise_app_error('invalid', 'Unknown invite type.');
  end if;
  insert into public.invite_links (kind, target_id, created_by, expires_at)
  values (p_kind, v_target, v_uid, case when p_expires_hours is null then null else now() + make_interval(hours => p_expires_hours) end)
  returning code into v_code;
  return v_code;
end $$;

create or replace function public.get_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.invite_links; v_res jsonb;
begin
  select * into v from public.invite_links where code = p_code;
  if v.code is null then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if v.expires_at is not null and v.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if v.max_uses is not null and v.uses >= v.max_uses then return jsonb_build_object('valid', false, 'reason', 'used'); end if;
  if v.kind = 'friend' then
    select jsonb_build_object('username', username, 'display_name', display_name, 'avatar_url', avatar_url) into v_res from public.profiles where id = v.target_id;
  elsif v.kind = 'group' then
    select jsonb_build_object('name', name, 'logo_url', logo_url, 'members', (select count(*) from public.group_members where group_id = g.id)) into v_res from public.groups g where id = v.target_id;
  else
    select jsonb_build_object('name', name, 'starts_at', starts_at, 'venue', venue, 'format_size', format_size) into v_res from public.sessions where id = v.target_id;
  end if;
  return jsonb_build_object('valid', true, 'kind', v.kind, 'target_id', v.target_id, 'preview', v_res);
end $$;

create or replace function public.accept_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v public.invite_links; v_result text;
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
    insert into public.group_members (group_id, user_id) values (v.target_id, v_uid) on conflict do nothing;
    v_result := 'joined';
  else
    insert into public.session_invitations (session_id, user_id, invited_by) values (v.target_id, v_uid, v.created_by) on conflict do nothing;
    v_result := 'invited';
  end if;
  update public.invite_links set uses = uses + 1 where code = p_code;
  return jsonb_build_object('kind', v.kind, 'target_id', v.target_id, 'result', v_result);
end $$;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
create or replace function public.report_content(p_type text, p_target uuid, p_reason text, p_group uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_id uuid;
begin
  perform public.check_rate_limit('report', 20, interval '1 day');
  insert into public.reports (reporter_id, target_type, target_id, reason, group_id)
  values (v_uid, p_type, p_target, p_reason, p_group) returning id into v_id;
  if p_group is not null then
    perform public.notify(m.user_id, 'moderation_report', 'New report', 'Content in your group was reported.', jsonb_build_object('group_id', p_group, 'report_id', v_id))
      from public.group_members m where m.group_id = p_group and m.role in ('owner', 'admin', 'moderator');
  end if;
  return v_id;
end $$;

create or replace function public.delete_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_c public.comments; v_group uuid;
begin
  select * into v_c from public.comments where id = p_comment;
  if v_c.id is null then perform public.raise_app_error('not_found', 'Comment not found.'); end if;
  select group_id into v_group from public.activity_feed where id = v_c.activity_id;
  if v_c.author_id <> v_uid and not (v_group is not null and public.is_group_moderator(v_group, v_uid)) then
    perform public.raise_app_error('forbidden', 'You cannot delete this comment.');
  end if;
  update public.comments set deleted_at = now(), body = '[deleted]' where id = p_comment;
  if v_c.author_id <> v_uid then
    insert into public.moderation_actions (actor_id, group_id, target_type, target_id, action)
    values (v_uid, v_group, 'comment', p_comment, 'delete');
  end if;
end $$;

create or replace function public.resolve_report(p_report uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_r public.reports;
begin
  select * into v_r from public.reports where id = p_report for update;
  if v_r.id is null or v_r.group_id is null or not public.is_group_moderator(v_r.group_id, v_uid) then
    perform public.raise_app_error('forbidden', 'You cannot moderate this report.');
  end if;
  if p_action = 'remove_member' and v_r.target_type = 'user' then
    perform public.remove_group_member(v_r.group_id, v_r.target_id);
  elsif p_action = 'delete_comment' and v_r.target_type = 'comment' then
    perform public.delete_comment(v_r.target_id);
  elsif p_action = 'delete_activity' and v_r.target_type = 'activity' then
    delete from public.activity_feed where id = v_r.target_id and group_id = v_r.group_id;
  end if;
  update public.reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end::public.report_status, resolved_at = now()
   where id = p_report;
  insert into public.moderation_actions (actor_id, group_id, report_id, target_type, target_id, action, reason)
  values (v_uid, v_r.group_id, p_report, v_r.target_type, v_r.target_id, p_action, p_reason);
end $$;

-- Called by the delete-account Edge Function (service role) before deleting the auth user.
create or replace function public.prepare_account_deletion(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_g record; v_next uuid;
begin
  for v_g in select group_id from public.group_members where user_id = p_user and role = 'owner' loop
    select user_id into v_next from public.group_members
     where group_id = v_g.group_id and user_id <> p_user
     order by case role when 'admin' then 0 when 'moderator' then 1 else 2 end, joined_at limit 1;
    if v_next is null then
      delete from public.groups where id = v_g.group_id;
    else
      update public.group_members set role = 'member' where group_id = v_g.group_id and user_id = p_user;
      update public.group_members set role = 'owner' where group_id = v_g.group_id and user_id = v_next;
    end if;
  end loop;
  -- cancel upcoming sessions hosted by this user that have no co-host or group
  update public.sessions set status = 'cancelled', cancelled_at = now()
   where host_id = p_user and status = 'scheduled' and group_id is null
     and not exists (select 1 from public.session_hosts h where h.session_id = sessions.id and h.user_id <> p_user);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (p_user, 'account.deleted', 'profile', p_user);
end $$;
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
