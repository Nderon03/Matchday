-- A finished season is frozen: a game finalised after its season has been decided (e.g. scores entered
-- days late) still counts for career stats, but doesn't join that season, so the race, Wrapped and the
-- badges already handed out always agree.
create or replace function public.trg_session_season()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finalised' and new.group_id is not null then
    if new.season_id is null then
      new.season_id := public.ensure_group_season(new.group_id, new.starts_at::date);
    end if;
    if old.status is distinct from 'finalised' and exists (select 1 from public.seasons where id = new.season_id and status = 'completed') then
      new.season_id := null;
    end if;
  end if;
  return new;
end $$;
