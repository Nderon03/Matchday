import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * For moments that should play once per device: `due` is true until `markDone()` is called.
 * Starts false until storage has been read, so nothing flashes up by mistake.
 */
export function useOnce(key: string | null, enabled = true) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!key || !enabled) return;
    let alive = true;
    AsyncStorage.getItem(key).then((v) => { if (alive && !v) setDue(true); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key, enabled]);
  const markDone = useCallback(() => {
    setDue(false);
    if (key) AsyncStorage.setItem(key, '1').catch(() => undefined);
  }, [key]);
  return { due: due && enabled && !!key, markDone };
}
