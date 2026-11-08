// Ready-made messages a host can drop into the group chat: the starter kit for moving a
// weekly game onto MATCHDAY. Short, scannable on WhatsApp, link on its own line.

export function groupInviteMessage(name: string, url: string) {
  return [
    `⚽ We're running ${name} on MATCHDAY from now on.`,
    '',
    `Tap to join the group: ${url}`,
    '',
    "• Say “I'm in” for each game (waiting list if it's full)",
    '• Fair teams picked from everyone’s ratings',
    '• Goals, MOTM votes and your own player card',
    '• Pay your share in the app, no more chasing',
    '',
    'Free on Android or in your browser.',
  ].join('\n');
}

export interface GameInviteInfo {
  name: string;
  starts_at: string;
  venue?: string | null;
  format_size?: number | null;
  places_left?: number | null;
  price_pence?: number | null;
}

export function gameInviteMessage(g: GameInviteInfo, url: string) {
  const d = new Date(g.starts_at);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const bits = [
    g.format_size ? `${g.format_size}-a-side` : null,
    g.places_left == null ? null : g.places_left <= 0 ? 'full, join the waiting list' : `${g.places_left} place${g.places_left === 1 ? '' : 's'} left`,
    g.price_pence ? `£${(g.price_pence / 100).toFixed(2).replace(/\.00$/, '')} each` : null,
  ].filter(Boolean);
  return [
    `⚽ ${g.name}: ${day}, ${time}${g.venue ? ` at ${g.venue}` : ''}`,
    bits.length ? bits.join(' · ') : null,
    '',
    `Tap “I'm in”: ${url}`,
  ].filter((l) => l !== null).join('\n');
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
