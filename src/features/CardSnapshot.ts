import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, type HostInstance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import { LITE_MODE } from '@/lib/device';
import type { PlayerCardData } from '@/components/football/PlayerCard';
import { usePreferences } from '@/hooks/queries';
import { rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const key = (uid: string) => `matchday.cardSnapshot.${uid}`;

/**
 * Keeps a still picture of your own player card in storage, so the link preview when you share
 * your invite link (WhatsApp, iMessage...) is your actual card. Runs quietly on your profile when
 * something on the card has changed; removed again if your profile or stats aren't public.
 * Returns `still`: true for the moment the picture is taken (no shine half-way across it).
 */
export function useCardSnapshot(ref: RefObject<HostInstance | null>, userId: string | null | undefined, data: PlayerCardData | null, enabled: boolean) {
  const prefs = usePreferences();
  const [still, setStill] = useState(false);
  const busy = useRef(false);
  const isPublic = prefs.data ? prefs.data.profile_visibility === 'public' && prefs.data.show_stats : null;
  const s = data?.stats;
  const signature = data ? JSON.stringify([
    data.display_name, data.avatar_url, data.position, data.card_style, data.title ?? null, data.medals ?? [], data.nationality ?? null,
    data.supported_club ?? null, data.achievements ?? 0, data.reliability?.pct ?? null,
    s ? [s.sessions, s.wins, s.win_pct, s.motm, s.goals, s.assists, s.rating] : null,
  ]) : null;

  useEffect(() => {
    // older / low-memory phones skip the background card photo (link previews show the MATCHDAY image)
    if (!enabled || LITE_MODE || !userId || !signature || isPublic === null || busy.current) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      busy.current = true;
      try {
        const last = await AsyncStorage.getItem(key(userId));
        const want = isPublic ? signature : 'off';
        if (last === want || cancelled) return;
        if (!isPublic) {
          await supabase.storage.from('share-cards').remove([`${userId}/card.jpg`]);
          await rpc('set_card_image', { p_saved: false });
        } else {
          setStill(true);
          await new Promise((r) => setTimeout(r, 350));
          const shot = await captureRef(ref, { format: 'jpg', quality: 0.86, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' });
          setStill(false);
          const body = await (await fetch(shot)).arrayBuffer();
          const { error } = await supabase.storage.from('share-cards').upload(`${userId}/card.jpg`, body, { contentType: 'image/jpeg', upsert: true });
          if (error) throw error;
          await rpc('set_card_image', { p_saved: true });
        }
        await AsyncStorage.setItem(key(userId), want);
      } catch {
        // best effort: the preview falls back to the MATCHDAY image
        setStill(false);
      } finally {
        busy.current = false;
      }
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [enabled, userId, signature, isPublic, ref]);

  return still;
}
