import { useQuery } from '@tanstack/react-query';
import { q } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * The ranked title (season badge) each player has chosen for their card, for the little rank pips
 * next to names. Players showing a normal title (or none) get no pip. One query for the whole list.
 */
export function useCardSeasons(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u && !u.startsWith('guest:')))].sort();
  const res = useQuery({
    queryKey: ['card-seasons', ids.join(',')], enabled: ids.length > 0, staleTime: 5 * 60_000,
    queryFn: () => q<{ id: string; card_title: string | null }[]>(supabase.from('profiles').select('id, card_title').in('id', ids).like('card_title', 'season:%')),
  });
  const map: Record<string, string> = {};
  for (const r of res.data ?? []) if (r.card_title?.startsWith('season:')) map[r.id] = r.card_title.slice(7);
  return map;
}
