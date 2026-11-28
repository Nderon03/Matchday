import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { q, rpc } from './api';
import { useAuth } from '@/providers/AuthProvider';

/**
 * "Have I already seen this?" for celebration moments, remembered on the account (so seeing it on
 * the phone counts on the website too) and on the device (so it still works without signal). A
 * moment counts as seen if EITHER remembers it; whatever a device knew before this was added is
 * copied up to the account the first time it runs.
 */
type Seen = Record<string, string>;
const queryKey = (uid: string | null) => ['seen-moments', uid];

export function useSeenMoments() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKey(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => Object.fromEntries(
      (await q<{ key: string; value: string }[]>(supabase.from('seen_moments').select('key, value'))).map((r) => [r.key, r.value]),
    ) as Seen,
  });
  const mark = useCallback((entries: Seen) => {
    if (!userId || !Object.keys(entries).length) return;
    qc.setQueryData<Seen>(queryKey(userId), (old) => {
      const next = { ...(old ?? {}) };
      for (const [k, v] of Object.entries(entries)) if (!next[k] || v > next[k]) next[k] = v;
      return next;
    });
    // no signal: the device copy still holds it, and it's sent up next time the moment loads
    rpc('mark_moments_seen', { p: entries }).catch(() => undefined);
  }, [qc, userId]);
  // ready once the account's markers are known (or couldn't be fetched: then the device copy decides)
  return { seen: query.data, ready: !!userId && (query.isSuccess || query.isError), mark };
}

const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : a > b ? a : b);

/**
 * For moments that show everything newer than a point in time (new friends, medal level-ups).
 * Returns that point (null while loading) and `advance(to)` for when the person has seen up to `to`.
 * The very first time, on any device, it starts from "now", so nobody gets a backlog.
 */
export function useSeenSince(name: string, deviceKey: (uid: string) => string) {
  const { userId } = useAuth();
  const { seen, ready, mark } = useSeenMoments();
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState<string | null>(null);
  const settled = useRef(false);
  // the device copy keeps the storage name it always had, so phones remember what they'd seen
  const localKey = userId ? deviceKey(userId) : null;

  useEffect(() => {
    if (!localKey) return;
    let alive = true;
    AsyncStorage.getItem(localKey).then((v) => alive && setLocal(v)).catch(() => alive && setLocal(null));
    return () => { alive = false; };
  }, [localKey]);

  useEffect(() => {
    if (settled.current || !localKey || local === undefined || !ready) return;
    settled.current = true;
    const server = seen?.[name] ?? null;
    const best = later(local, server) ?? new Date().toISOString();
    setValue(best);
    if (best !== local) AsyncStorage.setItem(localKey, best).catch(() => undefined);
    if (best !== server) mark({ [name]: best });
  }, [local, ready, seen, name, localKey, mark]);

  // another device moved it on (e.g. seen on the website): follow it
  const server = seen?.[name];
  useEffect(() => {
    if (settled.current && server && value && server > value) {
      setValue(server);
      if (localKey) AsyncStorage.setItem(localKey, server).catch(() => undefined);
    }
  }, [server, value, localKey]);

  const advance = useCallback((to: string) => {
    setValue((v) => later(v, to));
    if (localKey) AsyncStorage.setItem(localKey, to).catch(() => undefined);
    mark({ [name]: to });
  }, [localKey, mark, name]);

  return { since: value, advance };
}

/**
 * For one-off moments keyed by what they're about (a game's reveal, a season, a group welcome).
 * `isSeen(key)` is null while loading; `markSeen(keys)` records them on the device and the account.
 * `legacy` lists keys this device remembered under its old storage, to copy up once.
 */
export function useSeenFlags(legacy?: string[] | null) {
  const { seen, ready, mark } = useSeenMoments();
  const copied = useRef(false);
  useEffect(() => {
    if (copied.current || !ready || !legacy?.length) return;
    copied.current = true;
    const missing = legacy.filter((k) => !seen?.[k]);
    if (missing.length) mark(Object.fromEntries(missing.map((k) => [k, '1'])));
  }, [ready, legacy, seen, mark]);
  const isSeen = useCallback((key: string) => (ready ? !!seen?.[key] : null), [ready, seen]);
  const markSeen = useCallback((keys: string[]) => mark(Object.fromEntries(keys.map((k) => [k, '1']))), [mark]);
  return { ready, isSeen, markSeen };
}
