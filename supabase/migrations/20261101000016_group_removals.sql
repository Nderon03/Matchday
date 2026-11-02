-- Removing members from a group: removed players can only come back when an admin
-- re-admits them (directly, or via "Allow back"). Group invite links, join requests and
-- re-adds by regular members are blocked while the removal stands. Leaving voluntarily
-- does not count as a removal.
create table public.group_removals (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  removed_by uuid references public.profiles (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 200),
  removed_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_removals enable row level security;
create policy group_removals_select on public.group_removals for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));
revoke insert, update, delete on public.group_removals from authenticated, anon;

create or replace function public.is_removed_from_group(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_removals where group_id = p_group and user_id = p_user);
$$;
revoke execute on function public.is_removed_from_group(uuid, uuid) from public, anon, authenticated;

drop function if exists public.remove_group_member(uuid, uuid);


create or replace function public.remove_group_member(p_group uuid, p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_my public.group_role; v_their public.group_role; v_name text;
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
  if v_their is null then perform public.raise_app_error('not_found', 'That player is not in this group.'); end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  if p_user <> v_uid then
    -- removed by an admin: they can only come back when re-admitted
    insert into public.group_removals (group_id, user_id, removed_by, reason)
    values (p_group, p_user, v_uid, nullif(trim(p_reason), ''))
    on conflict (group_id, user_id) do update set removed_by = excluded.removed_by, reason = excluded.reason, removed_at = now();
    update public.group_join_requests set status = 'rejected', decided_by = v_uid, decided_at = now()
     where group_id = p_group and user_id = p_user and status = 'pending';
    select name into v_name from public.groups where id = p_group;
    perform public.notify(p_user, 'group_removed', 'Removed from ' || v_name,
      coalesce('Reason: ' || nullif(trim(p_reason), '') || '. ', '') || 'You can only rejoin if an admin adds you back.',
      jsonb_build_object('group_id', p_group, 'group_name', v_name, 'reason', nullif(trim(p_reason), '')));
  end if;
  perform public.log_audit(case when p_user = v_uid then 'group.member_left' else 'group.member_removed' end, 'group', p_group,
    jsonb_build_object('user_id', p_user, 'reason', p_reason));
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
  if public.is_removed_from_group(p_group, v_uid) then
    perform public.raise_app_error('removed', 'An admin removed you from this group. You can only rejoin if an admin adds you back.');
  end if;
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
    if public.is_removed_from_group(v.target_id, v_uid) then
      perform public.raise_app_error('removed', 'An admin removed you from this group. You can only rejoin if an admin adds you back.');
    end if;
    insert into public.group_members (group_id, user_id) values (v.target_id, v_uid) on conflict do nothing;
    v_result := 'joined';
  else
    if exists (select 1 from public.session_attendance where session_id = v.target_id and user_id = v_uid and status = 'removed') then
      perform public.raise_app_error('removed', 'The host removed you from this session. Ask them to invite you again.');
    end if;
    insert into public.session_invitations (session_id, user_id, invited_by) values (v.target_id, v_uid, v.created_by) on conflict do nothing;
    v_result := 'invited';
  end if;
  update public.invite_links set uses = uses + 1 where code = p_code;
  return jsonb_build_object('kind', v.kind, 'target_id', v.target_id, 'result', v_result);
end $$;

create or replace function public.add_group_members(p_group uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_group public.groups;
  v_u uuid;
  v_n int := 0;
  v_me public.profiles;
begin
  perform public.check_rate_limit('add_group_members', 100, interval '1 hour');
  select * into v_group from public.groups where id = p_group;
  if v_group.id is null or not public.is_group_member(p_group, v_uid) then
    perform public.raise_app_error('not_found', 'Group not found.');
  end if;
  if not public.is_group_admin(p_group, v_uid) and v_group.join_policy = 'invite_only' then
    perform public.raise_app_error('forbidden', 'Only admins can add members to this group.');
  end if;
  select * into v_me from public.profiles where id = v_uid;
  foreach v_u in array coalesce(p_users, '{}') loop
    continue when v_u = v_uid or not public.are_friends(v_uid, v_u) or public.is_blocked_between(v_uid, v_u);
    -- removed players can only be brought back by an admin (which lifts the removal)
    if public.is_removed_from_group(p_group, v_u) then
      continue when not public.is_group_admin(p_group, v_uid);
      delete from public.group_removals where group_id = p_group and user_id = v_u;
    end if;
    insert into public.group_members (group_id, user_id) values (p_group, v_u) on conflict do nothing;
    if found then
      v_n := v_n + 1;
      update public.group_join_requests set status = 'accepted', decided_by = v_uid, decided_at = now()
       where group_id = p_group and user_id = v_u and status = 'pending';
      perform public.notify(v_u, 'group_added', 'Added to ' || v_group.name,
        v_me.display_name || ' added you to ' || v_group.name || '. You can leave any time from the group settings.',
        jsonb_build_object('group_id', p_group));
    end if;
  end loop;
  perform public.log_audit('group.members_added', 'group', p_group, jsonb_build_object('count', v_n));
  return v_n;
end $$;

-- Admin brings a removed player back (no friendship needed). They are added and notified.
create or replace function public.readmit_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_name text;
begin
  if not public.is_group_admin(p_group, v_uid) then
    perform public.raise_app_error('forbidden', 'Only group admins can add removed players back.');
  end if;
  if not public.is_removed_from_group(p_group, p_user) then
    perform public.raise_app_error('not_found', 'That player is not on the removed list.');
  end if;
  delete from public.group_removals where group_id = p_group and user_id = p_user;
  insert into public.group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
  select name into v_name from public.groups where id = p_group;
  perform public.notify(p_user, 'group_added', 'Added back to ' || v_name, 'An admin added you back to ' || v_name || '.',
    jsonb_build_object('group_id', p_group));
  perform public.log_audit('group.member_readmitted', 'group', p_group, jsonb_build_object('user_id', p_user));
end $$;

