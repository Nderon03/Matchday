-- One title on the card. Season badges are now "ranked titles" ('season:s1_elite'), shown with their
-- badge; the separate season-badge slot is retired. When a new badge is earned it becomes your title
-- automatically only if you have no title or are already showing a ranked one (never over "Baller" etc.).
create or replace function public.give_season_badge(p_user uuid, p_quarter date, p_tier text, p_season uuid, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text; v_n int;
begin
  v_code := case when p_tier = 'preseason' then 'pre' else 's' || public.season_number(p_quarter) || '_' || p_tier end;
  insert into public.season_badges (user_id, quarter_start, code, tier, season_id, group_id)
  values (p_user, p_quarter, v_code, p_tier, p_season, p_group)
  on conflict (user_id, quarter_start) do update
    set code = excluded.code, tier = excluded.tier, season_id = excluded.season_id, group_id = excluded.group_id, created_at = now()
    where public.season_tier_rank(excluded.tier) > public.season_tier_rank(public.season_badges.tier);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    update public.profiles set card_title = 'season:' || v_code
     where id = p_user and (card_title is null or card_title like 'season:%');
  end if;
end $$;
revoke execute on function public.give_season_badge(uuid, date, text, uuid, uuid) from public, anon, authenticated;

-- anything already in the old slot moves to the title (if the title is free)
update public.profiles set card_title = 'season:' || card_season where card_season is not null and card_title is null;
