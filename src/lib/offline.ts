import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type Query } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import { rpc } from './api';

/**
 * Bad signal at the pitch: what you've already loaded (home, your games, each game's page,
 * groups, profiles) is saved on the phone and shown when there's no connection, and a
 * check-in made offline is sent as soon as you're back online.
 */
const CACHE_KEY = 'matchday.offlineCache.v1';
const CHECKINS_KEY = 'matchday.pendingCheckins';
const KEEP = new Set(['profile', 'home', 'sessions', 'session', 'groups', 'group', 'player', 'achievements', 'friends', 'prefs', 'notifications']);
const MAX_AGE = 7 * 86400_000;

const keep = (q: Query) => q.state.status === 'success' && KEEP.has(String(q.queryKey[0]));

/** Put back what was saved last time (before the app renders, so it can show straight away). */
export async function restoreOfflineCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { savedAt: number; state: unknown };
    if (Date.now() - saved.savedAt > MAX_AGE) return;
    hydrate(queryClient, saved.state as Parameters<typeof hydrate>[1]);
    // show it straight away, but still fetch the latest as soon as each screen opens
    await queryClient.invalidateQueries({ refetchType: 'none' });
  } catch {
    // a bad or old cache just means loading from the network as usual
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Keep the saved copy up to date (a few seconds after things change). */
export function startOfflineCache() {
  return queryClient.getQueryCache().subscribe(() => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const state = dehydrate(queryClient, { shouldDehydrateQuery: keep });
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), state })).catch(() => undefined);
    }, 3000);
  });
}

/** Signing out forgets everything saved on the phone. */
export async function clearOfflineCache() {
  await AsyncStorage.multiRemove([CACHE_KEY, CHECKINS_KEY]).catch(() => undefined);
}

// ---- connection state, from how requests are going ----
let offline = false;
const listeners = new Set<(v: boolean) => void>();
export function setOffline(v: boolean) {
  if (offline === v) return;
  offline = v;
  listeners.forEach((l) => l(v));
  if (!v) flushCheckins().catch(() => undefined);
}
export const isNetworkError = (e: unknown) => (e as { code?: string })?.code === 'network'
  || /Failed to fetch|Network request failed|NetworkError|network/i.test((e as Error)?.message ?? '');

queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated') return;
  const { status, error } = event.query.state;
  if (status === 'error' && isNetworkError(error)) setOffline(true);
  else if (status === 'success' && event.action.type === 'success') setOffline(false);
});

export function useOffline() {
  const [v, setV] = useState(offline);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}

// ---- check-ins made without signal ----
async function pending(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(CHECKINS_KEY)) ?? '[]'); } catch { return []; }
}
export async function hasPendingCheckin(sessionId: string) {
  return (await pending()).includes(sessionId);
}

/** Check in; with no signal it's saved and sent later. Returns 'sent' or 'queued'. */
export async function checkInOrQueue(sessionId: string): Promise<'sent' | 'queued'> {
  try {
    await rpc('check_in', { p_session: sessionId });
    return 'sent';
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const list = await pending();
    if (!list.includes(sessionId)) await AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify([...list, sessionId]));
    setOffline(true);
    return 'queued';
  }
}

let flushing = false;
export async function flushCheckins() {
  if (flushing) return;
  flushing = true;
  try {
    const left: string[] = [];
    for (const id of await pending()) {
      try {
        await rpc('check_in', { p_session: id });
        queryClient.invalidateQueries({ queryKey: ['session', id] });
      } catch (e) {
        // still no signal: try again later; anything else (game over, not in it): drop it
        if (isNetworkError(e)) left.push(id);
      }
    }
    await AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify(left));
  } finally {
    flushing = false;
  }
}
