import { useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '@/components/ui';

/** Run a mutation with busy state, success toast, error toast and query invalidation. */
export function useAction(invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) toast.success(typeof success === 'function' ? success(r) : success);
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      return r;
    } catch (e) {
      toast.error(e);
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}
