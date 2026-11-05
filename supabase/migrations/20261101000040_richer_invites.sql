-- Invite landing page: richer previews so it feels like meeting a player / group / game.
-- Friend: their card (style, flag, club, stats if their privacy allows), medal points and mutual
-- friends. Group: a few members' faces and where it plays. Game: host, place, places left, price.
create or replace function public.get_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.invite_links; v_res jsonb; v_viewer uuid := auth.uid(); c record;
begin
  select * into v from public.invite_links where code = p_code;
  if v.code is null then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if v.expires_at is not null and v.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if v.max_uses is not null and v.uses >= v.max_uses then return jsonb_build_object('valid', false, 'reason', 'used'); end if;
  if v_viewer is not null and v.kind = 'friend' and public.is_blocked_between(v.target_id, v_viewer) then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v.kind = 'friend' then
    select * into c from public.v_career_stats where user_id = v.target_id;
    select jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'position', p.position,
        'nationality', p.nationality, 'supported_club', p.supported_club, 'card_style', p.card_style,
        'is_self', p.id = v_viewer,
        'already_friends', v_viewer is not null and public.are_friends(p.id, v_viewer),
        'medal_points', public.medal_points(p.id),
        'stats', case when v_viewer is not null and public.can_view_profile_details(p.id, v_viewer) and c.user_id is not null then jsonb_build_object(
            'sessions', c.sessions, 'fixtures', c.fixtures, 'wins', c.wins, 'losses', c.losses, 'win_pct', c.win_pct,
            'goals', c.goals, 'assists', c.assists, 'motm', c.motm, 'rating', c.rating) end,
        'mutual', (
          select coalesce(jsonb_agg(jsonb_build_object('display_name', m.display_name, 'avatar_url', m.avatar_url) order by m.display_name), '[]'::jsonb)
            from (select pr.display_name, pr.avatar_url from public.profiles pr
                   where v_viewer is not null and pr.id not in (p.id, v_viewer)
                     and public.are_friends(pr.id, p.id) and public.are_friends(pr.id, v_viewer)
                   order by pr.display_name limit 5) m),
        'mutual_count', (select count(*) from public.profiles pr where v_viewer is not null and pr.id not in (p.id, v_viewer)
                          and public.are_friends(pr.id, p.id) and public.are_friends(pr.id, v_viewer)))
      into v_res from public.profiles p where p.id = v.target_id;
  elsif v.kind = 'group' then
    select jsonb_build_object('name', g.name, 'logo_url', g.logo_url, 'location', g.location, 'description', g.description,
             'members', (select count(*) from public.group_members where group_id = g.id),
             'already_member', v_viewer is not null and public.is_group_member(g.id, v_viewer),
             'faces', (select coalesce(jsonb_agg(jsonb_build_object('display_name', x.display_name, 'avatar_url', x.avatar_url)), '[]'::jsonb)
                         from (select pr.display_name, pr.avatar_url from public.group_members m join public.profiles pr on pr.id = m.user_id
                                where m.group_id = g.id order by (pr.avatar_url is null), m.joined_at limit 6) x),
             'invited_by', (select display_name from public.profiles where id = v.created_by))
      into v_res from public.groups g where g.id = v.target_id;
  else
    select jsonb_build_object('name', s.name, 'starts_at', s.starts_at, 'venue', s.venue, 'area', coalesce(s.location, s.postcode),
             'format_size', s.format_size, 'status', s.status, 'payment_mode', s.payment_mode, 'price_pence', s.price_pence,
             'places_left', greatest(0, s.max_attendance - public.confirmed_count(s.id)), 'max', s.max_attendance,
             'host', (select display_name from public.profiles where id = s.host_id),
             'host_avatar', (select avatar_url from public.profiles where id = s.host_id))
      into v_res from public.sessions s where s.id = v.target_id;
  end if;
  return jsonb_build_object('valid', true, 'kind', v.kind, 'target_id', v.target_id, 'preview', v_res);
end $$;
