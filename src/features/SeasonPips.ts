import { useQuery } from '@tanstack/react-query';
import { q } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * The season badge each player shows on their card (null if they've turned it off), for the little
 * rank pips next to names. One query for the whole list.
 */
export function useCardSeasons(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u && !u.startsWith('guest:')))].sort();
  const res = useQuery({
    queryKey: ['card-seasons', ids.join(',')], enabled: ids.length > 0, staleTime: 5 * 60_000,
    queryFn: () => q<{ id: string; card_season: string | null }[]>(supabase.from('profiles').select('id, card_season').in('id', ids).not('card_season', 'is', null)),
  });
  const map: Record<string, string> = {};
  for (const r of res.data ?? []) if (r.card_season) map[r.id] = r.card_season;
  return map;
}
