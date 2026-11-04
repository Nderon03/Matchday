// Kick-off forecast from MET Norway's Locationforecast 2.0 (api.met.no, CC BY 4.0).
// Pure helpers (no Deno APIs) so they can be unit tested.

export const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
/** MET Norway asks for an identifying User-Agent with a contact. */
export const MET_USER_AGENT = 'MATCHDAY/1.0 matchdayapp.org matchdayenquiries@hotmail.com';
/** How far ahead MET forecasts are useful (hourly ~2.5 days, then 6-hourly to ~9 days). */
export const MAX_DAYS_AHEAD = 9;

export interface KickoffWeather {
  at: string;
  temp_c: number;
  wind_mph: number;
  precip_mm: number | null;
  symbol: string;
  summary: string;
  icon: string;
}

interface MetEntry {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number } };
    next_1_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
  };
}

/** "lightrainshowers_day" → readable words and an Ionicons name. */
export function describeSymbol(symbol: string): { summary: string; icon: string } {
  const s = symbol.replace(/_(day|night|polartwilight)$/, '');
  const night = symbol.endsWith('_night');
  if (s.includes('thunder')) return { summary: 'Thunderstorms', icon: 'thunderstorm-outline' };
  if (s.includes('sleet')) return { summary: 'Sleet', icon: 'snow-outline' };
  if (s.includes('snow')) return { summary: s.startsWith('light') ? 'Light snow' : 'Snow', icon: 'snow-outline' };
  if (s.includes('rain')) {
    const strength = s.startsWith('heavy') ? 'Heavy rain' : s.startsWith('light') ? 'Light rain' : 'Rain';
    return { summary: s.includes('showers') ? `${strength} showers` : strength, icon: s.includes('showers') ? 'rainy-outline' : 'rainy-outline' };
  }
  if (s === 'fog') return { summary: 'Fog', icon: 'cloud-outline' };
  if (s === 'cloudy') return { summary: 'Cloudy', icon: 'cloud-outline' };
  if (s === 'partlycloudy' || s === 'fair') return { summary: s === 'fair' ? 'Mostly clear' : 'Partly cloudy', icon: night ? 'cloudy-night-outline' : 'partly-sunny-outline' };
  if (s === 'clearsky') return { summary: 'Clear', icon: night ? 'moon-outline' : 'sunny-outline' };
  return { summary: 'Mixed', icon: 'cloud-outline' };
}

/** Picks the forecast entry nearest kick-off (within 3 hours) and turns it into something readable. */
export function kickoffWeather(timeseries: MetEntry[], kickoff: Date): KickoffWeather | null {
  let best: MetEntry | null = null;
  let gap = Infinity;
  for (const e of timeseries) {
    const d = Math.abs(new Date(e.time).getTime() - kickoff.getTime());
    if (d < gap && (e.data.next_1_hours || e.data.next_6_hours)) { best = e; gap = d; }
  }
  if (!best || gap > 3 * 3600_000) return null;
  const next = best.data.next_1_hours ?? best.data.next_6_hours!;
  const { summary, icon } = describeSymbol(next.summary.symbol_code);
  const det = best.data.instant.details;
  return {
    at: best.time,
    temp_c: Math.round(det.air_temperature ?? 0),
    wind_mph: Math.round((det.wind_speed ?? 0) * 2.23694),
    precip_mm: best.data.next_1_hours?.details?.precipitation_amount ?? null,
    symbol: next.summary.symbol_code,
    summary,
    icon,
  };
}

/** Coordinates trimmed to 4 decimals, as MET requires (also improves their caching). */
export const metQuery = (lat: number, lng: number) => `${MET_URL}?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
