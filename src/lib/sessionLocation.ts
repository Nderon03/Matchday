import { rpc } from '@/lib/api';
import { findPostcode, normalisePostcode } from '@/lib/postcodes';

const tried = new Set<string>();

/**
 * Adds a game's map location after it's been created, so creating never waits on the postcode
 * lookup. Returns 'not_found' when the postcode doesn't exist (the host should fix it).
 */
export async function locateSessionLater(sessionId: string, postcode: string): Promise<'ok' | 'not_found' | 'unavailable'> {
  const pc = normalisePostcode(postcode);
  if (!pc) return 'not_found';
  const key = `${sessionId}:${pc}`;
  if (tried.has(key)) return 'unavailable';
  tried.add(key);
  const r = await findPostcode(pc);
  if (!r.place) {
    tried.delete(key);
    return r.unavailable ? 'unavailable' : 'not_found';
  }
  await rpc('set_session_location', { p_session: sessionId, p_postcode: pc, p_lat: r.place.latitude, p_lng: r.place.longitude }).catch(() => undefined);
  return 'ok';
}
