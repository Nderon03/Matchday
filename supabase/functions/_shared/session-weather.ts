// Forecast for a session (service role): from the hour-long cache, or fetched from MET Norway.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { kickoffWeather, MAX_DAYS_AHEAD, MET_USER_AGENT, metQuery, type KickoffWeather } from './weather.ts';

export async function getSessionWeather(admin: SupabaseClient, sessionId: string): Promise<KickoffWeather | null> {
  const { data: s } = await admin.from('sessions').select('id, starts_at, latitude, longitude, status').eq('id', sessionId).maybeSingle();
  if (!s || s.latitude == null || s.longitude == null || s.status === 'cancelled') return null;
  const kickoff = new Date(s.starts_at);
  const ahead = kickoff.getTime() - Date.now();
  if (ahead < -3 * 3600_000 || ahead > MAX_DAYS_AHEAD * 86400_000) return null;
  const { data: cached } = await admin.from('session_weather').select('fetched_at, weather').eq('session_id', s.id).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 3600_000) return cached.weather as KickoffWeather | null;
  try {
    const res = await fetch(metQuery(Number(s.latitude), Number(s.longitude)), { headers: { 'User-Agent': MET_USER_AGENT } });
    if (!res.ok) {
      console.error('MET Norway', res.status);
      return (cached?.weather as KickoffWeather | null) ?? null;
    }
    const body = await res.json();
    const weather = kickoffWeather(body?.properties?.timeseries ?? [], kickoff);
    await admin.from('session_weather').upsert({ session_id: s.id, fetched_at: new Date().toISOString(), weather });
    return weather;
  } catch (e) {
    console.error('MET Norway', e);
    return (cached?.weather as KickoffWeather | null) ?? null;
  }
}
