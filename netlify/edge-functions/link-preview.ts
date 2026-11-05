// Adds WhatsApp / iMessage / social link-preview tags to invite links (/invite/<code>), using a
// short public summary from the database. Everything else about the page is unchanged.
import type { Config, Context } from 'https://edge.netlify.com';

type Preview = {
  kind: 'session' | 'group' | 'friend';
  name: string;
  starts_at?: string;
  venue?: string | null;
  area?: string | null;
  format_size?: number;
  status?: string;
  price_pence?: number;
  places_left?: number;
  members?: number;
} | null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function when(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(' ', '');
  return `${day}, ${time}`;
}

export function describe(p: Preview): { title: string; description: string } {
  if (!p) return { title: 'MATCHDAY', description: 'Your weekly game, sorted: invites, fair teams, stats, MOTM votes and payments.' };
  if (p.kind === 'session') {
    if (p.status === 'cancelled') return { title: `${p.name} (cancelled)`, description: 'This game was cancelled.' };
    const place = [p.venue, p.area].filter(Boolean).join(', ');
    const spots = p.places_left === 0 ? 'Full: join the waiting list' : `${p.places_left} place${p.places_left === 1 ? '' : 's'} left`;
    const price = !p.price_pence ? 'Free' : `£${(p.price_pence / 100).toFixed(2).replace(/\.00$/, '')} + booking fee`;
    return {
      title: `⚽ ${p.name} · ${p.format_size}-a-side`,
      description: [p.starts_at ? when(p.starts_at) : null, place || null, spots, price].filter(Boolean).join(' · ') + '. Tap to join on MATCHDAY.',
    };
  }
  if (p.kind === 'group') {
    return { title: `Join ${p.name} on MATCHDAY`, description: `${p.members} member${p.members === 1 ? '' : 's'}${p.area ? ` · ${p.area}` : ''}. Tap to join the group.` };
  }
  return { title: `${p.name} invited you to MATCHDAY`, description: 'Join to play together, see each other’s stats and get invited to games.' };
}

export default async (request: Request, context: Context) => {
  const res = await context.next();
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const url = new URL(request.url);
  const code = url.pathname.split('/')[2] ?? '';
  let preview: Preview = null;
  const base = Netlify.env.get('EXPO_PUBLIC_SUPABASE_URL');
  const key = Netlify.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (base && key && /^[A-Za-z0-9]{6,40}$/.test(code)) {
    try {
      const r = await fetch(`${base}/rest/v1/rpc/get_link_preview`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_code: code }),
        signal: AbortSignal.timeout(2500),
      });
      if (r.ok) preview = await r.json();
    } catch {
      // no preview: the page still works
    }
  }
  const { title, description } = describe(preview);
  const image = `${url.origin}/og.png`;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="MATCHDAY">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url.href)}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="description" content="${esc(description)}">`,
  ].join('');
  const html = (await res.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace('</head>', `${tags}</head>`);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=60');
  return new Response(html, { status: res.status, headers });
};

export const config: Config = { path: '/invite/*' };
