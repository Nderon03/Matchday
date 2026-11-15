-- 1. Deleting a group: its "group only" games become invite-only games (they can't be group-only
--    without a group, which blocked deleting any group that had group games). Players, results and
--    stats are kept.
create or replace function public.trg_group_delete_detach_games()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.sessions set visibility = 'private' where group_id = old.id and visibility = 'group';
  return old;
end $$;
drop trigger if exists group_delete_detach_games on public.groups;
create trigger group_delete_detach_games before delete on public.groups for each row execute function public.trg_group_delete_detach_games();

-- 2. The host can't make it: hosting passes to someone who's playing, so the game still runs.
--    Who: a co-host who's in, then a group admin who's in, then whoever said "I'm in" first.
--    Free games: they become the host. Paid games: they become co-host (they can run everything)
--    and the original host stays the payee, since players' payments are already set up to them.
create or replace function public.trg_host_handover()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.sessions; v_new uuid; v_new_name text; v_old_name text; v_paid boolean;
begin
  if new.status = 'confirmed' or old.status is distinct from 'confirmed' then return new; end if;
  select * into v from public.sessions where id = new.session_id;
  if v.id is null or v.status <> 'scheduled' or v.host_id is distinct from new.user_id then return new; end if;

  select a.user_id into v_new
    from public.session_attendance a
   where a.session_id = v.id and a.status = 'confirmed' and a.user_id <> new.user_id
   order by (exists (select 1 from public.session_hosts h where h.session_id = v.id and h.user_id = a.user_id)) desc,
            (v.group_id is not null and public.is_group_admin(v.group_id, a.user_id)) desc,
            a.responded_at
   limit 1;
  if v_new is null then return new; end if;

  v_paid := v.payment_mode <> 'free';
  select display_name into v_new_name from public.profiles where id = v_new;
  select display_name into v_old_name from public.profiles where id = new.user_id;
  insert into public.session_hosts (session_id, user_id) values (v.id, v_new) on conflict do nothing;
  if not v_paid then
    update public.sessions set host_id = v_new where id = v.id;
    delete from public.session_hosts where session_id = v.id and user_id = v_new;
  end if;

  perform public.notify(v_new, 'host_handover', 'You’re hosting ' || v.name,
    v_old_name || ' can’t make it, so you’re running the game now' || case when v_paid then ' (payments still go to ' || v_old_name || ').' else '.' end,
    jsonb_build_object('session_id', v.id));
  perform public.notify(a.user_id, 'host_handover', v_new_name || ' is hosting ' || v.name,
    v_old_name || ' can’t make it. ' || v_new_name || ' is running the game.', jsonb_build_object('session_id', v.id))
    from public.session_attendance a where a.session_id = v.id and a.status = 'confirmed' and a.user_id <> v_new;
  if v_paid then
    perform public.notify(new.user_id, 'host_handover', v_new_name || ' is running ' || v.name,
      'You can’t make it, so ' || v_new_name || ' is co-hosting. Payments still come to you.', jsonb_build_object('session_id', v.id));
  end if;
  return new;
end $$;
drop trigger if exists host_handover on public.session_attendance;
create trigger host_handover after update of status on public.session_attendance for each row execute function public.trg_host_handover();
