-- Add friends to a group directly (no invite link needed).
-- Allowed for admins, or for any member when the group is not invite-only.
-- Only the caller's friends can be added; each added player is notified.
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
