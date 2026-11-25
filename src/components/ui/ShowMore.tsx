import React, { useState } from 'react';
import { Button } from './Button';

/**
 * Long lists draw the first `step` rows, with a button for the next batch, so a player with years
 * of history doesn't make an older phone draw hundreds of cards at once. Changing `resetKey`
 * (e.g. switching tabs) starts again from the first batch.
 */
export function useShowMore<T>(list: T[], step = 20, resetKey?: unknown) {
  const [state, setState] = useState({ key: resetKey, count: step });
  let count = state.count;
  if (state.key !== resetKey) {
    // the list changed to a different one: start again (React's "reset state on prop change" pattern)
    count = step;
    setState({ key: resetKey, count: step });
  }
  const visible = list.length > count ? list.slice(0, count) : list;
  const more = list.length - visible.length;
  const footer = more > 0
    ? <Button title={`Show ${Math.min(step, more)} more`} variant="secondary" size="sm" onPress={() => setState({ key: resetKey, count: count + step })} />
    : null;
  return { visible, footer };
}
