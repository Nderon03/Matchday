// Adds WhatsApp / iMessage / social link-preview tags to every page of matchdayapp.org. Invite links
// (/invite/<code>) get a short public summary from the database; other pages get their own title and
// description. Everything else about the page is unchanged.
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
  // friend invites: the person's card
  username?: string;
  card_style?: string;
  card_title?: string | null;
  card_image?: string | null;
  stats?: { games: number; goals: number; assists: number; motm: number; rating: number | null } | null;
} | null;

// mirrors src/domain/achievements.ts and src/domain/titles.ts (names only)
const STYLE_NAMES: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', hall_of_fame: 'Hall of Fame' };
const TITLES: Record<string, string> = {
  weekend_warrior: 'Weekend Warrior',
  sunday_leaguer: 'Sunday Leaguer',
  bib_collector: 'Bib Collector',
  astro_turfer: 'Astro Turfer',
  jumpers_for_goalposts: 'Jumpers for Goalposts',
  tekkers_trainee: 'Tekkers Trainee',
  fresh_boots: 'Fresh Boots',
  club_regular: 'Club Regular',
  centurion: 'Centurion',
  off_the_mark: 'Off the Mark',
  poacher: 'Poacher',
  goal_machine: 'Goal Machine',
  brace_yourself: 'Brace Yourself',
  hat_trick_hero: 'Hat-trick Hero',
  provider: 'The Provider',
  architect: 'The Architect',
  man_of_the_moment: 'Man of the Moment',
  baller: 'Baller',
  main_character: 'Main Character',
  ever_present: 'Ever Present',
  serial_winner: 'Serial Winner',
  brick_wall: 'Brick Wall',
  always_turns_up: 'Always Turns Up',
  player_of_the_season: 'Player of the Season',
  elite: 'Elite',
  legend: 'Legend',
};
const titleName = (id?: string | null) => (id ? TITLES[id] ?? null : null);
const n = (v: number, one: string) => `${v} ${one}${v === 1 ? '' : 's'}`;

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
  // a friend invite: make it about them
  const style = p.card_style ? STYLE_NAMES[p.card_style] : undefined;
  const title = titleName(p.card_title);
  const tag = [title ? `“${title}”` : null, style ? `${style} card` : null].filter(Boolean).join(' · ');
  const s = p.stats;
  const line = s && s.games > 0
    ? [s.rating != null ? `${Number(s.rating).toFixed(1)} rating` : null, n(s.games, 'game'), n(s.goals, 'goal'), s.assists ? n(s.assists, 'assist') : null, s.motm ? `${s.motm} MOTM` : null].filter(Boolean).join(' · ') + '. '
    : '';
  return {
    title: `${p.name}${tag ? ` · ${tag}` : ''} on MATCHDAY`,
    description: `${line}Add ${p.name.split(' ')[0]} as a friend to play together and compare stats.`,
  };
}

// the public pages people share; anything else gets the homepage text
const HOME = { title: 'MATCHDAY · Your weekly game, sorted', description: 'Invites, waiting lists, fair teams, stats, MOTM votes and payments for your 5-a-side. Free on Android and in your browser.' };
const PAGES: Record<string, { title: string; description: string }> = {
  '/': HOME,
  '/welcome': HOME,
  '/sign-up': { title: 'Join MATCHDAY', description: 'Create your free account: organise your weekly game, get a player card that levels up, and settle up without chasing.' },
  '/sign-in': { title: 'Sign in · MATCHDAY', description: HOME.description },
  '/help': { title: 'Help & FAQ · MATCHDAY', description: 'How games, teams, payments, stats, medals and the Dream Team work on MATCHDAY.' },
  '/legal/privacy': { title: 'Privacy Policy · MATCHDAY', description: 'What MATCHDAY collects, why, and your rights.' },
  '/legal/terms': { title: 'Terms of Use · MATCHDAY', description: 'The terms for using MATCHDAY.' },
  '/legal/delete-account': { title: 'Delete your account · MATCHDAY', description: 'How to delete your MATCHDAY account and data.' },
};
const clean = (pathname: string) => pathname.replace(/\/+$/, '') || '/';
export const pageText = (pathname: string) => PAGES[clean(pathname)] ?? HOME;

export default async (request: Request, context: Context) => {
  const res = await context.next();
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const url = new URL(request.url);
  const invite = url.pathname.startsWith('/invite/');
  const path = clean(url.pathname);
  const code = invite ? url.pathname.split('/')[2] ?? '' : '';
  let preview: Preview = null;
  const base = Netlify.env.get('EXPO_PUBLIC_SUPABASE_URL');
  const key = Netlify.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (invite && base && key && /^[A-Za-z0-9]{6,40}$/.test(code)) {
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
  const { title, description } = invite ? describe(preview) : pageText(url.pathname);
  // a friend's own card picture when they have one (only saved while their profile is public)
  const image = preview?.kind === 'friend' && preview.card_image && base
    ? `${base}/storage/v1/object/public/share-cards/${preview.card_image}`
    : `${url.origin}/og.png`;
  const generic = image.endsWith('/og.png');
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="MATCHDAY">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url.href)}">`,
    `<meta property="og:image" content="${image}">`,
    ...(generic ? [`<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`] : [`<meta property="og:image:type" content="image/jpeg">`]),
    `<meta property="og:image:alt" content="${esc(title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="description" content="${esc(description)}">`,
    // public pages get a canonical address (the homepage is / even when opened as /welcome)
    ...(!invite && PAGES[path] ? [`<link rel="canonical" href="${esc(url.origin + (path === '/welcome' ? '/' : path))}">`] : []),
  ].join('');
  const html = (await res.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace('</head>', `${tags}</head>`);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  if (invite) headers.set('cache-control', 'public, max-age=60');
  return new Response(html, { status: res.status, headers });
};

export const config: Config = { path: '/*', excludedPath: ['/_expo/*', '/assets/*', '/*.png', '/*.ico', '/*.js', '/*.css', '/*.json', '/*.txt', '/*.xml', '/*.ttf'] };
