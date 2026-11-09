-- Between games on the night, new line-ups don't notify anyone: the players are at the pitch and
-- the host tells them. Notifications still go out for the first game's teams (before kick-off).

create or replace function public.save_lineup(p_fixture uuid, p_teams jsonb, p_confirm boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session uuid := public.session_of_fixture(p_fixture);
  v public.sessions;
  v_fixture public.fixtures;
  v_side text;
  v_team public.fixture_teams;
  v_player jsonb;
  v_order int;
  v_starters int;
begin
  if v_session is null then perform public.raise_app_error('not_found', 'Fixture not found.'); end if;
  v := public.require_session_manager(v_session);
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v.status in ('finalised', 'cancelled') then
    perform public.raise_app_error('locked', 'Line-ups are locked for this session.');
  end if;
  if v_fixture.played and v.status = 'completed' then
    perform public.raise_app_error('locked', 'This fixture has been played; line-ups are locked.');
  end if;

  delete from public.team_players where fixture_id = p_fixture;
  foreach v_side in array array['A', 'B'] loop
    select * into v_team from public.fixture_teams where fixture_id = p_fixture and side = v_side::public.team_side;
    update public.fixture_teams set
      name = coalesce(nullif(trim(p_teams -> v_side ->> 'name'), ''), name),
      colour = coalesce(nullif(p_teams -> v_side ->> 'colour', ''), colour)
     where id = v_team.id;
    v_order := 0; v_starters := 0;
    for v_player in select * from jsonb_array_elements(coalesce(p_teams -> v_side -> 'players', '[]'::jsonb)) loop
      if nullif(v_player ->> 'guest_id', '') is not null then
        if not exists (select 1 from public.session_guests where id = (v_player ->> 'guest_id')::uuid and session_id = v_session and status = 'confirmed') then
          perform public.raise_app_error('ineligible_player', 'That guest is no longer in the squad.');
        end if;
      elsif not exists (
        select 1 from public.session_attendance
         where session_id = v_session and user_id = (v_player ->> 'user_id')::uuid
           and status = 'confirmed' and verification <> 'absent'
      ) then
        perform public.raise_app_error('ineligible_player', 'Only confirmed players can be selected.');
      end if;
      if not coalesce((v_player ->> 'is_substitute')::boolean, false) then v_starters := v_starters + 1; end if;
      insert into public.team_players (fixture_team_id, fixture_id, user_id, guest_id, position, is_goalkeeper, is_substitute, sort_order)
      values (v_team.id, p_fixture, nullif(v_player ->> 'user_id', '')::uuid, nullif(v_player ->> 'guest_id', '')::uuid,
              coalesce(v_player ->> 'position', 'ANY')::public.player_position,
              coalesce((v_player ->> 'is_goalkeeper')::boolean, false),
              coalesce((v_player ->> 'is_substitute')::boolean, false), v_order);
      v_order := v_order + 1;
    end loop;
    if v_starters > v.format_size then
      perform public.raise_app_error('too_many_players', 'Each team can field at most ' || v.format_size || ' starting players.');
    end if;
  end loop;

  if p_confirm then
    update public.fixtures set lineup_confirmed_at = now() where id = p_fixture;
    -- everyone in the squad hears about it (not only those picked), and again when teams change
    if v.status = 'scheduled' or (v.status = 'in_progress' and v_fixture.number = 1) then
      perform public.notify(a.user_id, 'lineup_announced',
        case when v_fixture.lineup_confirmed_at is null then 'Line-ups are in' else 'Line-ups updated' end,
        'Teams for ' || v.name || case when v.mode = 'multi' then ' (game ' || v_fixture.number || ')' else '' end
          || case when v_fixture.lineup_confirmed_at is null then ' have been announced.' else ' have changed. Check your team.' end,
        jsonb_build_object('session_id', v_session, 'fixture_id', p_fixture))
      from public.session_attendance a
     where a.session_id = v_session and a.status = 'confirmed' and a.user_id <> auth.uid();
    end if;
  end if;
  perform public.log_audit('lineup.saved', 'fixture', p_fixture, p_teams);
end $$;
