// Kick-off forecast for a session the caller can see, from MET Norway (cached for an hour).
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { getSessionWeather } from '../_shared/session-weather.ts';

Deno.serve(handler(async (req) => {
  const { client } = await requireUser(req);
  const { session_id } = (await req.json().catch(() => ({}))) as { session_id?: string };
  if (!session_id) throw new HttpError(400, 'bad_request', 'session_id is required.');
  // read as the caller first, so RLS decides whether they can see this session
  const { data: s } = await client.from('sessions').select('id').eq('id', session_id).maybeSingle();
  if (!s) throw new HttpError(404, 'not_found', 'Session not found.');
  return json({ weather: await getSessionWeather(adminClient(), s.id) });
}));
