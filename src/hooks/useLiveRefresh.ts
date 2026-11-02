import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeInvalidate } from './useRealtime';

/**
 * Every notification marks a change somewhere (an invite, a removal, a result, an approval).
 * When one arrives, refresh the cached screens that could show stale state, so e.g. a player
 * who is re-invited sees "I'm in" everywhere, not just after opening the notification.
 */
export function useLiveRefresh() {
  const { userId } = useAuth();
  useRealtimeInvalidate(
    'live-refresh',
    [{ table: 'notifications', filter: `user_id=eq.${userId}` }],
    [['notifications'], ['home'], ['tasks'], ['sessions'], ['session'], ['friends'], ['groups'], ['group'], ['payments']],
    !!userId,
  );
}
