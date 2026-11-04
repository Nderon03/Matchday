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

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.result ?? null) as T | null;
  } catch {
    return null;
  }
}

/** A full postcode → its coordinates and area (null if it doesn't exist). */
export async function lookupPostcode(input: string): Promise<Place | null> {
  const pc = normalisePostcode(input);
  if (!pc) return null;
  const r = await get<{ postcode: string; latitude: number; longitude: number; admin_district?: string; admin_ward?: string }>(`/postcodes/${encodeURIComponent(pc)}`);
  if (!r || r.latitude == null) return null;
  return { label: r.postcode, postcode: r.postcode, latitude: r.latitude, longitude: r.longitude, area: [r.admin_ward, r.admin_district].filter(Boolean).join(', ') };
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
