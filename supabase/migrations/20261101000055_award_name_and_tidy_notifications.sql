-- 1. With several games in a session, the award is "Player of the Night" ("Player of the Day" for
--    a kick-off before 5pm). It still counts as a Man of the Match in stats and medals.
-- 2. Notifications show in the app's own list, which has our icons: no emoji at the start or end
--    of a title or message ("Goals approved ✅" → "Goals approved").

create or replace function public.motm_title(p_session uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when (select count(*) from public.fixtures where session_id = p_session) > 1 then
      case when extract(hour from (select starts_at from public.sessions where id = p_session) at time zone 'Europe/London') < 17
        then 'Player of the Day' else 'Player of the Night' end
    else 'Man of the Match' end
$$;
grant execute on function public.motm_title(uuid) to authenticated;

create or replace function public.strip_edge_emoji(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(coalesce(p, ''),
    '^[\s\U0001F300-\U0001FAFF☀-➿⭐✅️]+|[\s\U0001F300-\U0001FAFF☀-➿⭐✅️]+$', '', 'g'))
$$;

create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_body text default '', p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prefs public.user_preferences;
  v_push text := 'skipped';
  v_email text := 'skipped';
  v_award text;
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
  -- the award's name depends on how many games were played
  if coalesce(p_data ->> 'session_id', '') <> '' and (p_title like '%Man of the Match%' or coalesce(p_body, '') like '%Man of the Match%') then
    v_award := public.motm_title((p_data ->> 'session_id')::uuid);
    p_title := replace(p_title, 'Man of the Match', v_award);
    p_body := replace(p_body, 'Man of the Match', v_award);
  end if;
  insert into public.notifications (user_id, type, title, body, data, push_status, email_status)
  values (p_user, p_type, public.strip_edge_emoji(p_title), public.strip_edge_emoji(p_body), coalesce(p_data, '{}'::jsonb), v_push, v_email);
end $$;
