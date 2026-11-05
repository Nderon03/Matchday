/** Calendar subscription links for a player's feed token. */
export function calendarLinks(token: string, supabaseUrl: string) {
  const https = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/calendar-feed?token=${token}`;
  const webcal = https.replace(/^https?:/, 'webcal:');
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}
