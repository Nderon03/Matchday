import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { pendingReveals, type MatchReveal } from '@/domain/matchReveal';
import { MatchRevealCard } from './MatchRevealCard';
import { AchievementCelebration } from './AchievementCelebration';

const seenKey = (uid: string) => `matchday.revealed.${uid}`;

/**
 * After a game is finalised: first the "your match" card (once per game), then any medal
 * level-ups. Only one is ever on screen at a time.
 */
export function PostMatchMoments() {
  const { userId } = useAuth();
  useRealtimeInvalidate('reveals', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], [['reveals']], !!userId);
  const reveals = useQuery({ queryKey: ['reveals'], queryFn: () => rpc<MatchReveal[]>('get_match_reveals'), enabled: !!userId });
  const [seen, setSeen] = useState<string[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(userId))
      .then((v) => { if (alive) setSeen(v ? JSON.parse(v) : []); })
      .catch(() => alive && setSeen([]));
    return () => { alive = false; };
  }, [userId]);

  const pending = useMemo(() => (seen && reveals.data ? pendingReveals(reveals.data, seen) : null), [seen, reveals.data]);

  const markSeen = (ids: string[]) => {
    if (!userId || !seen) return;
    const next = [...new Set([...seen, ...ids])].slice(-60);
    setSeen(next);
    AsyncStorage.setItem(seenKey(userId), JSON.stringify(next)).catch(() => undefined);
  };

  if (!userId) return null;
  if (reveals.isError) return <AchievementCelebration />;
  if (!pending) return null;
  if (pending.show.length) {
    // older unseen games are skipped quietly (marked seen with the first one) so nobody gets a backlog
    const r = pending.show[0];
    return <MatchRevealCard key={r.session_id} r={r} onDone={() => markSeen([r.session_id, ...pending.skip.map((x) => x.session_id)])} />;
  }
  return <AchievementCelebration />;
}
