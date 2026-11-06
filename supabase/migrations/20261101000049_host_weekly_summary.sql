-- Monday-morning summary for hosts: one notification per game they host in the coming week,
-- e.g. "Wednesday Football · Wed 19:00: 8/10 in · 2 yet to reply · £12 unpaid".
create or replace function public.send_host_weekly_summaries()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_sent int := 0; v_parts text[];
begin
  for r in
    select s.id, s.name, s.host_id, s.group_id, s.starts_at, s.max_attendance,
           public.confirmed_count(s.id) as confirmed,
           (select count(*) from public.session_invitations i
             where i.session_id = s.id and not exists (select 1 from public.session_attendance a where a.session_id = s.id and a.user_id = i.user_id))::int as no_reply,
           case when s.group_id is null then 0 else (
             select coalesce(sum(p.amount_pence), 0)::int from public.payments p join public.sessions x on x.id = p.session_id
              where x.group_id = s.group_id and x.status <> 'cancelled' and p.status in ('unpaid', 'failed')) end as unpaid_pence
      from public.sessions s
     where s.status = 'scheduled' and s.host_id is not null
       and s.starts_at between now() and now() + interval '7 days'
       and not exists (select 1 from public.notifications n
                        where n.user_id = s.host_id and n.type = 'host_summary' and n.data ->> 'session_id' = s.id::text
                          and n.created_at > now() - interval '6 days')
  loop
    v_parts := array[r.confirmed || '/' || r.max_attendance || ' in'];
    if r.no_reply > 0 then v_parts := v_parts || (r.no_reply || ' yet to reply'); end if;
    if r.unpaid_pence > 0 then v_parts := v_parts || ('£' || to_char(r.unpaid_pence / 100.0, 'FM990.00') || ' unpaid in the group'); end if;
    if r.confirmed >= r.max_attendance then v_parts := v_parts || 'squad complete'::text; end if;
    perform public.notify(r.host_id, 'host_summary',
      r.name || ' · ' || to_char(r.starts_at at time zone 'Europe/London', 'Dy HH24:MI'),
      array_to_string(v_parts, ' · ') || '.',
      jsonb_build_object('session_id', r.id, 'session_name', r.name));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke execute on function public.send_host_weekly_summaries() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('matchday-host-summary', '7 8 * * 1', 'select public.send_host_weekly_summaries()');
  end if;
exception when others then
  raise notice 'Could not schedule host summaries: %', sqlerrm;
end $$;
