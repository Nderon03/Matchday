-- Group invitations: adding someone to a group now sends them an invitation they accept or
-- decline, instead of putting them in straight away. (Opening a group invite link yourself, or
-- an admin approving your own join request, still joins you directly: that's your choice.)
-- Also: an admin removing a player from a group takes them off the group's upcoming games.

create table if not exists public.group_invitations (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (group_id, user_id)
);
alter table public.group_invitations enable row level security;
create policy group_invitations_select on public.group_invitations for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id, auth.uid()));
revoke insert, update, delete on public.group_invitations from authenticated, anon;

-- Invite friends to a group (was: add them directly). Returns how many invitations were sent.
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
    perform public.raise_app_error('forbidden', 'Only admins can invite people to this group.');
  end if;
  select * into v_me from public.profiles where id = v_uid;
  foreach v_u in array coalesce(p_users, '{}') loop
    continue when v_u = v_uid or not public.are_friends(v_uid, v_u) or public.is_blocked_between(v_uid, v_u);
    continue when public.is_group_member(p_group, v_u);
    -- removed players can only be invited back by an admin (which lifts the removal)
    if public.is_removed_from_group(p_group, v_u) then
      continue when not public.is_group_admin(p_group, v_uid);
      delete from public.group_removals where group_id = p_group and user_id = v_u;
    end if;
    -- they already asked to join and an admin is inviting them: that's a yes from both sides
    if public.is_group_admin(p_group, v_uid) and exists (
      select 1 from public.group_join_requests where group_id = p_group and user_id = v_u and status = 'pending') then
      insert into public.group_members (group_id, user_id) values (p_group, v_u) on conflict do nothing;
      update public.group_join_requests set status = 'accepted', decided_by = v_uid, decided_at = now()
       where group_id = p_group and user_id = v_u and status = 'pending';
      perform public.notify(v_u, 'group_join_approved', 'Welcome to ' || v_group.name, 'Your request to join was accepted.',
        jsonb_build_object('group_id', p_group));
      v_n := v_n + 1;
      continue;
    end if;
    -- don't re-send a pending invitation
    continue when exists (select 1 from public.group_invitations where group_id = p_group and user_id = v_u and status = 'pending');
    insert into public.group_invitations (group_id, user_id, invited_by, status, created_at, decided_at)
    values (p_group, v_u, v_uid, 'pending', now(), null)
    on conflict (group_id, user_id) do update set invited_by = excluded.invited_by, status = 'pending', created_at = now(), decided_at = null;
    perform public.notify(v_u, 'group_invite', v_me.display_name || ' invited you to ' || v_group.name,
      'Accept to join the group, see its games and stats. You can decline if it’s not for you.',
      jsonb_build_object('group_id', p_group, 'group_name', v_group.name, 'invited_by', v_uid));
    v_n := v_n + 1;
  end loop;
  perform public.log_audit('group.members_invited', 'group', p_group, jsonb_build_object('count', v_n));
  return v_n;
end $$;

create or replace function public.respond_group_invite(p_group uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_inv public.group_invitations; v_name text; v_me text;
begin
  select * into v_inv from public.group_invitations where group_id = p_group and user_id = v_uid and status = 'pending' for update;
  if v_inv.group_id is null then
    if public.is_group_member(p_group, v_uid) then return 'already_member'; end if;
    perform public.raise_app_error('not_found', 'This invitation is no longer available.');
  end if;
  select name into v_name from public.groups where id = p_group;
  select display_name into v_me from public.profiles where id = v_uid;
  if not p_accept then
    update public.group_invitations set status = 'declined', decided_at = now() where group_id = p_group and user_id = v_uid;
    return 'declined';
  end if;
  if public.is_removed_from_group(p_group, v_uid) then
    perform public.raise_app_error('removed', 'An admin removed you from this group. You can only rejoin if an admin invites you back.');
  end if;
  insert into public.group_members (group_id, user_id) values (p_group, v_uid) on conflict do nothing;
  update public.group_invitations set status = 'accepted', decided_at = now() where group_id = p_group and user_id = v_uid;
  update public.group_join_requests set status = 'accepted', decided_at = now() where group_id = p_group and user_id = v_uid and status = 'pending';
  if v_inv.invited_by is not null then
    perform public.notify(v_inv.invited_by, 'group_invite_accepted', v_me || ' joined ' || v_name, 'They accepted your invitation.',
      jsonb_build_object('group_id', p_group, 'user_id', v_uid));
  end if;
  perform public.log_audit('group.invite_accepted', 'group', p_group);
  return 'joined';
end $$;
grant execute on function public.respond_group_invite(uuid, boolean) to authenticated;

-- Admins (or whoever sent it) can withdraw an invitation that hasn't been answered.
create or replace function public.cancel_group_invite(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  update public.group_invitations set status = 'cancelled', decided_at = now()
   where group_id = p_group and user_id = p_user and status = 'pending'
     and (invited_by = v_uid or public.is_group_admin(p_group, v_uid));
  if not found then perform public.raise_app_error('not_found', 'No pending invitation to cancel.'); end if;
end $$;
grant execute on function public.cancel_group_invite(uuid, uuid) to authenticated;

-- The signed-in player's pending group invitations (they can't see private groups until they join).
create or replace function public.get_my_group_invites()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'group_id', g.id, 'name', g.name, 'logo_url', g.logo_url, 'location', g.location,
      'members', (select count(*) from public.group_members m where m.group_id = g.id),
      'invited_by', (select display_name from public.profiles p where p.id = i.invited_by),
      'created_at', i.created_at) order by i.created_at desc), '[]'::jsonb)
    from public.group_invitations i join public.groups g on g.id = i.group_id
   where i.user_id = auth.uid() and i.status = 'pending'
     and not public.is_group_member(g.id, auth.uid());
$$;
grant execute on function public.get_my_group_invites() to authenticated;

-- An admin bringing a removed player back now invites them (they choose whether to come back).
create or replace function public.readmit_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_name text;
begin
  if not public.is_group_admin(p_group, v_uid) then
    perform public.raise_app_error('forbidden', 'Only group admins can invite removed players back.');
  end if;
  if not public.is_removed_from_group(p_group, p_user) then
    perform public.raise_app_error('not_found', 'That player is not on the removed list.');
  end if;
  delete from public.group_removals where group_id = p_group and user_id = p_user;
  select name into v_name from public.groups where id = p_group;
  insert into public.group_invitations (group_id, user_id, invited_by) values (p_group, p_user, v_uid)
  on conflict (group_id, user_id) do update set invited_by = excluded.invited_by, status = 'pending', created_at = now(), decided_at = null;
  perform public.notify(p_user, 'group_invite', 'You’re welcome back at ' || v_name,
    'An admin invited you back to ' || v_name || '. Accept to rejoin.',
    jsonb_build_object('group_id', p_group, 'group_name', v_name, 'invited_by', v_uid));
  perform public.log_audit('group.member_readmitted', 'group', p_group, jsonb_build_object('user_id', p_user));
end $$;

-- Removing a member (by an admin) also takes them off the group's upcoming games and cancels
-- any pending invitation; leaving voluntarily keeps games they've already said yes to.
create or replace function public.remove_group_member(p_group uuid, p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_my public.group_role; v_their public.group_role; v_name text; s record; v_games int := 0;
begin
  v_my := public.group_role_of(p_group, v_uid);
  v_their := public.group_role_of(p_group, p_user);
  if p_user = v_uid then
    if v_their = 'owner' then
      perform public.raise_app_error('owner_cannot_leave', 'Hand the group to another member (Group settings → Members → Transfer ownership) before leaving.');
    end if;
  elsif not (v_my = 'owner' or (v_my = 'admin' and v_their in ('moderator', 'member'))) then
    perform public.raise_app_error('forbidden', 'You do not have permission to remove this member.');
  end if;
  if v_their is null then perform public.raise_app_error('not_found', 'That player is not in this group.'); end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  update public.group_invitations set status = 'cancelled', decided_at = now() where group_id = p_group and user_id = p_user and status = 'pending';
  if p_user <> v_uid then
    insert into public.group_removals (group_id, user_id, removed_by, reason)
    values (p_group, p_user, v_uid, nullif(trim(p_reason), ''))
    on conflict (group_id, user_id) do update set removed_by = excluded.removed_by, reason = excluded.reason, removed_at = now();
    update public.group_join_requests set status = 'rejected', decided_by = v_uid, decided_at = now()
     where group_id = p_group and user_id = p_user and status = 'pending';
    -- off the group's upcoming games (not ones that have started)
    for s in
      select se.id from public.sessions se
       where se.group_id = p_group and se.status = 'scheduled' and se.starts_at > now() and se.host_id is distinct from p_user
         and (exists (select 1 from public.session_attendance a where a.session_id = se.id and a.user_id = p_user and a.status in ('confirmed', 'waitlisted'))
              or exists (select 1 from public.session_invitations i where i.session_id = se.id and i.user_id = p_user))
    loop
      insert into public.session_attendance (session_id, user_id, status) values (s.id, p_user, 'removed')
      on conflict (session_id, user_id) do update set status = 'removed', waitlisted_at = null, checked_in_at = null,
        verification = 'unverified', offer_expires_at = null, responded_at = now();
      update public.session_attendance set removed_reason = 'Removed from the group', removed_at = now()
       where session_id = s.id and user_id = p_user;
      delete from public.session_invitations where session_id = s.id and user_id = p_user;
      delete from public.session_hosts where session_id = s.id and user_id = p_user;
      delete from public.team_players tp using public.fixtures f where tp.fixture_id = f.id and f.session_id = s.id and f.played = false and tp.user_id = p_user;
      loop
        exit when public.promote_from_waitlist(s.id) is null;
      end loop;
      v_games := v_games + 1;
    end loop;
    select name into v_name from public.groups where id = p_group;
    perform public.notify(p_user, 'group_removed', 'Removed from ' || v_name,
      coalesce('Reason: ' || nullif(trim(p_reason), '') || '. ', '') || 'You can only rejoin if an admin invites you back.'
        || case when v_games > 0 then ' You’ve also been taken off the group’s upcoming game' || case when v_games > 1 then 's' else '' end || '.' else '' end,
      jsonb_build_object('group_id', p_group, 'group_name', v_name, 'reason', nullif(trim(p_reason), '')));
  end if;
  perform public.log_audit(case when p_user = v_uid then 'group.member_left' else 'group.member_removed' end, 'group', p_group,
    jsonb_build_object('user_id', p_user, 'reason', p_reason));
end $$;
