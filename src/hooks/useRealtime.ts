import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isConfigured } from '@/lib/env';

/** Subscribe to Postgres changes (RLS-filtered) and invalidate the given queries. */
export function useRealtimeInvalidate(
  channel: string,
  subscriptions: { table: string; filter?: string }[],
  keys: QueryKey[],
  enabled = true,
) {
  const qc = useQueryClient();
  const sig = JSON.stringify([channel, subscriptions, keys]);
  useEffect(() => {
    if (!enabled || !isConfigured) return;
    let ch = supabase.channel(`${channel}-${Math.random().toString(36).slice(2, 8)}`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })), 250);
    };
    for (const s of subscriptions) {
      ch = ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: s.table, filter: s.filter }, invalidate);
    }
    ch.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled]);
}
