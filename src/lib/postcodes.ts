/**
 * UK postcode lookups via postcodes.io (free, no key; Ordnance Survey + Royal Mail open data).
 * Used to place sessions on the map and to search "near" a postcode, district or town.
 * We send only the postcode or place name typed, never the user's own location.
 */
export interface Place { label: string; latitude: number; longitude: number; postcode?: string; area?: string }

const API = 'https://api.postcodes.io';
const FULL = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/i;

/** "nw72eu" → "NW7 2EU"; null if it isn't a full UK postcode shape. */
export function normalisePostcode(input: string): string | null {
  const c = input.replace(/\s+/g, '').toUpperCase();
  return FULL.test(c) ? `${c.slice(0, -3)} ${c.slice(-3)}` : null;
}

export const isOutcode = (input: string) => OUTCODE.test(input.trim());

/** GET from postcodes.io with a time limit; `failed` means we couldn't reach it (not "not found"). */
async function fetchResult<T>(path: string, timeoutMs = 6000): Promise<{ result: T | null; failed: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { signal: ctrl.signal });
    if (res.status === 404) return { result: null, failed: false };
    if (!res.ok) return { result: null, failed: true };
    const body = await res.json();
    return { result: (body?.result ?? null) as T | null, failed: false };
  } catch {
    return { result: null, failed: true };
  } finally {
    clearTimeout(timer);
  }
}

async function get<T>(path: string): Promise<T | null> {
  return (await fetchResult<T>(path)).result;
}

type PostcodeRow = { postcode: string; latitude: number; longitude: number; admin_district?: string; admin_ward?: string };
const toPlace = (r: PostcodeRow): Place => ({ label: r.postcode, postcode: r.postcode, latitude: r.latitude, longitude: r.longitude, area: [r.admin_ward, r.admin_district].filter(Boolean).join(', ') });
const found = new Map<string, Place>();

/**
 * Look a full postcode up: `place` when it exists, `unavailable` when the lookup couldn't be
 * reached (slow or no signal), so the form can say which. Tries twice; remembers answers.
 */
export async function findPostcode(input: string): Promise<{ place: Place | null; unavailable: boolean }> {
  const pc = normalisePostcode(input);
  if (!pc) return { place: null, unavailable: false };
  const cached = found.get(pc);
  if (cached) return { place: cached, unavailable: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { result, failed } = await fetchResult<PostcodeRow>(`/postcodes/${encodeURIComponent(pc)}`);
    if (!failed) {
      if (!result || result.latitude == null) return { place: null, unavailable: false };
      const place = toPlace(result);
      found.set(pc, place);
      return { place, unavailable: false };
    }
  }
  return { place: null, unavailable: true };
}

/** A full postcode → its coordinates and area (null if it doesn't exist or can't be reached). */
export async function lookupPostcode(input: string): Promise<Place | null> {
  return (await findPostcode(input)).place;
}

/** Postcode, partial postcode ("NW7") or town/area name ("Mill Hill") → a point to search around. */
export async function lookupPlace(input: string): Promise<Place | null> {
  const q = input.trim();
  if (!q) return null;
  if (normalisePostcode(q)) return lookupPostcode(q);
  if (isOutcode(q)) {
    const r = await get<{ outcode: string; latitude: number; longitude: number; admin_district?: string[] }>(`/outcodes/${encodeURIComponent(q.toUpperCase())}`);
    if (r?.latitude != null) return { label: `${r.outcode}${r.admin_district?.[0] ? ` (${r.admin_district[0]})` : ''}`, latitude: r.latitude, longitude: r.longitude };
  }
  const places = await get<{ name_1: string; county_unitary?: string; region?: string; latitude: number; longitude: number }[]>(`/places?q=${encodeURIComponent(q)}&limit=1`);
  const p = places?.[0];
  return p ? { label: [p.name_1, p.county_unitary ?? p.region].filter(Boolean).join(', '), latitude: p.latitude, longitude: p.longitude } : null;
}
