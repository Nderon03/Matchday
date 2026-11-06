-- Personal link previews: when you share your invite link, WhatsApp & co. show your actual
-- player card (style, title, medals, stats) with your name, instead of the generic image.
-- The app saves a still picture of your card to share-cards/<you>/card.jpg when it changes;
-- it's only used (and only kept) while your profile and stats are public.

alter table public.profiles add column if not exists card_image_at timestamptz;

-- the app replaces / removes its own card picture
drop policy if exists "share cards update own" on storage.objects;
create policy "share cards update own" on storage.objects for update to authenticated
  using (bucket_id = 'share-cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "share cards delete own" on storage.objects;
create policy "share cards delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'share-cards' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.set_card_image(p_saved boolean default true)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_at timestamptz := case when p_saved then now() end;
begin
  if auth.uid() is null then perform public.raise_app_error('not_authenticated', 'Sign in first.'); end if;
  update public.profiles set card_image_at = v_at where id = auth.uid();
  return v_at;
end $$;
revoke execute on function public.set_card_image(boolean) from public, anon;
grant execute on function public.set_card_image(boolean) to authenticated;

-- link previews: friend invites now carry the card (only when the profile and stats are public)
create or replace function public.get_link_preview(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.invite_links; r jsonb; v_public boolean;
begin
  select * into v from public.invite_links where code = p_code;
  if v.code is null or (v.expires_at is not null and v.expires_at < now()) or (v.max_uses is not null and v.uses >= v.max_uses) then
    return null;
  end if;
  if v.kind = 'session' then
    select jsonb_build_object('kind', 'session', 'name', s.name, 'starts_at', s.starts_at, 'venue', s.venue, 'area', coalesce(s.location, s.postcode),
             'format_size', s.format_size, 'status', s.status, 'price_pence', case when s.payment_mode = 'free' then 0 else s.price_pence end,
             'places_left', greatest(0, s.max_attendance - public.confirmed_count(s.id)))
      into r from public.sessions s where s.id = v.target_id;
  elsif v.kind = 'group' then
    select jsonb_build_object('kind', 'group', 'name', g.name, 'area', g.location,
             'members', (select count(*) from public.group_members m where m.group_id = g.id))
      into r from public.groups g where g.id = v.target_id;
  else
    select coalesce(pr.profile_visibility = 'public' and pr.show_stats, true) into v_public
      from public.profiles p left join public.user_preferences pr on pr.user_id = p.id where p.id = v.target_id;
    select jsonb_build_object('kind', 'friend', 'name', p.display_name, 'username', p.username,
             'card_style', p.card_style, 'card_title', p.card_title,
             'card_image', case when v_public and p.card_image_at is not null
                                then p.id::text || '/card.jpg?v=' || extract(epoch from p.card_image_at)::bigint end,
             'stats', case when v_public then (
               select jsonb_build_object('games', count(*), 'goals', coalesce(sum(goals), 0), 'assists', coalesce(sum(assists), 0),
                        'motm', count(*) filter (where motm), 'rating', round(avg(rating_avg) filter (where rating_eligible), 1))
                 from public.session_player_statistics where user_id = p.id) end)
      into r from public.profiles p where p.id = v.target_id;
  end if;
  return r;
end $$;
grant execute on function public.get_link_preview(text) to anon, authenticated;
