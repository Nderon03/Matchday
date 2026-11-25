import { useEffect, useState } from 'react';

/**
 * One pop-up at a time: things that take over the screen (match reveal, "removed from a game",
 * what's new) register here while they're showing, and optional ones wait until nothing else is.
 */
const active = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useHoldSpotlight(id: string, showing: boolean) {
  useEffect(() => {
    if (!showing) return;
    active.add(id);
    emit();
    return () => { active.delete(id); emit(); };
  }, [id, showing]);
}

/** True while something other than `self` holds the screen. */
export function useSpotlightBusy(self: string) {
  const busy = () => [...active].some((x) => x !== self);
  const [v, setV] = useState(busy);
  useEffect(() => {
    const l = () => setV(busy());
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self]);
  return v;
}
