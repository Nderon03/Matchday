-- When a host raises max_attendance, move players up from the waiting list
-- (in order) until the session is full again. Each promoted player is notified.
create or replace function public.on_session_capacity_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_promoted uuid;
begin
  if new.max_attendance > old.max_attendance and new.status = 'scheduled' then
    loop
      v_promoted := public.promote_from_waitlist(new.id);
      exit when v_promoted is null;
    end loop;
  end if;
  return new;
end $$;

create trigger sessions_capacity_promote after update of max_attendance on public.sessions
  for each row execute function public.on_session_capacity_change();

revoke execute on function public.on_session_capacity_change() from public, anon, authenticated;
