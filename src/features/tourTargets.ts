import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';

/**
 * Things the app tour points at live in different components (tab bar, sidebar, headers).
 * They register with a callback ref, `ref={tourRef('tab-home')}`, and the tour looks them up
 * by name when it runs. Whichever is on screen (bottom bar on phones, sidebar on desktop) wins.
 */
const nodes = new Map<string, HostInstance | null>();

export const tourRef = (id: string) => (node: HostInstance | null) => {
  if (node) nodes.set(id, node);
  else if (nodes.get(id)) nodes.delete(id);
};

/** A ref-like handle for Coachmarks: resolves to whatever is registered under `id` right now. */
export const tourTarget = (id: string): RefObject<HostInstance | null> & { id: string } => ({
  id,
  get current() { return nodes.get(id) ?? null; },
}) as RefObject<HostInstance | null> & { id: string };
