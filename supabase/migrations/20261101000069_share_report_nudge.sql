-- After the final whistle: the host hears the match report is ready to send to the group chat
-- (players already get "Results are in"). Opens the game, where the report and the share button are.
create or replace function public.trg_share_report_nudge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finalised' and old.status is distinct from 'finalised' and new.host_id is not null then
    perform public.notify(new.host_id, 'share_results', 'Your match report is ready',
      'Score, ' || public.motm_title(new.id) || ', scorers and what was unlocked: send it to the group chat.',
      jsonb_build_object('session_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists share_report_nudge on public.sessions;
create trigger share_report_nudge after update of status on public.sessions for each row execute function public.trg_share_report_nudge();
