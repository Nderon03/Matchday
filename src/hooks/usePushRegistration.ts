import { useEffect, useRef } from 'react';
import { registerForPush } from '@/lib/notifications';

/** Register for push once per app launch after the user is signed in and onboarded. */
export function usePushRegistration(enabled: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) return;
    done.current = true;
    registerForPush().catch((e) => console.warn('Push registration failed', e));
  }, [enabled]);
}
