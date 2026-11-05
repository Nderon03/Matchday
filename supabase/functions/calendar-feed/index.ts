// A player's games as a calendar feed (subscribe once in Google/Apple Calendar; it keeps itself
// up to date). Public URL, so the long random token in it is what keeps it private.
import { adminClient } from '../_shared/http.ts';
import { calendarFeed, type FeedEvent } from '../_shared/ics.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') ?? '').replace(/\.ics$/, '');
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Not found', { status: 404 });
  const { data, error } = await adminClient().rpc('calendar_feed_events', { p_token: token });
  if (error) {
    console.error(error);
    return new Response('Calendar unavailable', { status: 503 });
  }
  // an unknown token gives an empty calendar rather than an error, so old links fail quietly
  const body = calendarFeed((data ?? []) as FeedEvent[], Deno.env.get('APP_URL') ?? 'https://matchdayapp.org');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="matchday.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
});
