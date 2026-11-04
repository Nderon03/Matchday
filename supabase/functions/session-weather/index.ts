// Kick-off forecast for a session the caller can see, from MET Norway (cached for an hour).
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { kickoffWeather, MAX_DAYS_AHEAD, MET_USER_AGENT, metQuery } from '../_shared/weather.ts';

Deno.serve(handler(async (req) => {
  const { client } = await requireUser(req);
  const { session_id } = (await req.json().catch(() => ({}))) as { session_id?: string };
  if (!session_id) throw new HttpError(400, 'bad_request', 'session_id is required.');
  // read as the caller, so RLS decides whether they can see this session
  const { data: s } = await client.from('sessions').select('id, starts_at, latitude, longitude, status').eq('id', session_id).maybeSingle();
  if (!s) throw new HttpError(404, 'not_found', 'Session not found.');
  const kickoff = new Date(s.starts_at);
  const ahead = kickoff.getTime() - Date.now();
  if (s.latitude == null || s.longitude == null || s.status === 'cancelled' || ahead < -3 * 3600_000 || ahead > MAX_DAYS_AHEAD * 86400_000) {
    return json({ weather: null });
  }
  const admin = adminClient();
  const { data: cached } = await admin.from('session_weather').select('fetched_at, weather').eq('session_id', s.id).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 3600_000) return json({ weather: cached.weather });

  const res = await fetch(metQuery(Number(s.latitude), Number(s.longitude)), { headers: { 'User-Agent': MET_USER_AGENT } });
  if (!res.ok) {
    console.error('MET Norway', res.status);
    return json({ weather: cached?.weather ?? null });
  }
  const body = await res.json();
  const weather = kickoffWeather(body?.properties?.timeseries ?? [], kickoff);
  await admin.from('session_weather').upsert({ session_id: s.id, fetched_at: new Date().toISOString(), weather });
  return json({ weather });
}));
