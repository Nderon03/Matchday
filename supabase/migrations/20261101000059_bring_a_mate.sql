-- "Bring a mate": a player who's in can share the game's link so a mate signs up and joins with
-- their own account (pays for themselves, gets stats). Open (public) games: always. Closed games
-- (group / private): only once the host switches on "Players can bring a mate". If a closed game
-- still isn't full a day before kick-off, the host is asked whether to switch it on.

alter table public.sessions
  add column if not exists players_can_invite boolean not null default false,
  add column if not exists mate_nudged_at timestamptz;

-- can this player share the game's link?
create or replace function public.can_bring_mate(p_session uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session and s.status = 'scheduled'
       and (s.visibility = 'public' or s.players_can_invite)
       and exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = p_user and a.status = 'confirmed')
  )
$$;
grant execute on function public.can_bring_mate(uuid, uuid) to authenticated;

create or replace function public.set_players_can_invite(p_session uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.sessions := public.require_session_manager(p_session);
begin
  update public.sessions set players_can_invite = coalesce(p_on, false) where id = p_session;
  perform public.log_audit('session.players_can_invite', 'session', p_session, jsonb_build_object('on', p_on));
end $$;
grant execute on function public.set_players_can_invite(uuid, boolean) to authenticated;

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
    -- hosts, and players who are in when "bring a mate" is allowed (open game, or host switched it on)
    if not public.is_session_manager(v_target, v_uid) and not public.can_bring_mate(v_target, v_uid) then
      perform public.raise_app_error('forbidden', 'Only the host can share this game’s link.');
    end if;
  else
    perform public.raise_app_error('invalid', 'Unknown invite type.');
  end if;
  insert into public.invite_links (kind, target_id, created_by, expires_at)
  values (p_kind, v_target, v_uid, case when p_expires_hours is null then null else now() + make_interval(hours => p_expires_hours) end)
  returning code into v_code;
  return v_code;
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
    -- a link a player shared stops working if the host switched "bring a mate" off (closed games)
    if v.created_by is not null and not public.is_session_manager(v.target_id, v.created_by)
       and not exists (select 1 from public.sessions s where s.id = v.target_id and (s.visibility = 'public' or s.players_can_invite)) then
      perform public.raise_app_error('invite_expired', 'The host has turned off joining through players’ links for this game.');
    end if;
    insert into public.session_invitations (session_id, user_id, invited_by) values (v.target_id, v_uid, v.created_by) on conflict do nothing;
    -- tell the player who brought them
    if v.created_by is not null and v.created_by <> v_uid and not public.is_session_manager(v.target_id, v.created_by) then
      perform public.notify(v.created_by, 'mate_joined', (select display_name from public.profiles where id = v_uid) || ' is on MATCHDAY',
        'They opened your link for ' || (select name from public.sessions where id = v.target_id) || '. Once they tap “I’m in”, they’re playing.',
        jsonb_build_object('session_id', v.target_id, 'user_id', v_uid));
    end if;
    v_result := 'invited';
  end if;
  update public.invite_links set uses = uses + 1 where code = p_code;
  return jsonb_build_object('kind', v.kind, 'target_id', v.target_id, 'result', v_result);
end $$;

-- a closed game still not full a day before kick-off: ask the host about letting players bring a mate (once)
create or replace function public.nudge_bring_a_mate()
returns int language plpgsql security definer set search_path = public as $$
declare g record; v_n int := 0;
begin
  for g in
    select s.id, s.name, s.host_id, s.max_attendance - (
             (select count(*) from public.session_attendance a where a.session_id = s.id and a.status = 'confirmed')
           + (select count(*) from public.session_guests sg where sg.session_id = s.id and sg.status = 'confirmed')) as short
      from public.sessions s
     where s.status = 'scheduled' and s.visibility <> 'public' and not s.players_can_invite and s.mate_nudged_at is null
       and s.starts_at between now() + interval '2 hours' and now() + interval '24 hours'
  loop
    continue when g.short <= 0;
    update public.sessions set mate_nudged_at = now() where id = g.id;
    perform public.notify(g.host_id, 'bring_mate_nudge', g.name || ' is ' || g.short || ' short',
      'A day to go. Let players bring a mate? Turn it on from the game page.', jsonb_build_object('session_id', g.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.nudge_bring_a_mate() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('matchday-bring-a-mate', '23 * * * *', 'select public.nudge_bring_a_mate()');
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end $$;
