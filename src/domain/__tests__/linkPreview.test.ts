import edge, { describe as describePreview, pageText } from '../../../netlify/edge-functions/link-preview';

describe('website link previews', () => {
  it('every public page has its own title and description', () => {
    expect(pageText('/').title).toMatch(/MATCHDAY/);
    expect(pageText('/welcome')).toEqual(pageText('/'));
    expect(pageText('/help/').title).toBe('Help & FAQ · MATCHDAY');
    expect(pageText('/legal/privacy').title).toBe('Privacy Policy · MATCHDAY');
    expect(pageText('/sign-up').title).toBe('Join MATCHDAY');
  });
  it('private pages fall back to the homepage text', () => {
    expect(pageText('/session/abc')).toEqual(pageText('/'));
  });
  it('invite links still describe the game', () => {
    const d = describePreview({ kind: 'session', name: 'Wednesday Football', format_size: 5, places_left: 2, price_pence: 600, venue: 'Riverside', area: 'NW7' });
    expect(d.title).toBe('⚽ Wednesday Football · 5-a-side');
    expect(d.description).toContain('2 places left');
  });
});

describe('what Google reads on the homepage', () => {
  const shell = '<html><head><title>MATCHDAY</title><link rel="icon" href="/favicon.ico"/></head><body><noscript> You need to enable JavaScript to run this app. </noscript><div id="root"></div></body></html>';
  (globalThis as any).Netlify = { env: { get: () => undefined } };
  const run = async (path: string) => {
    const res = await edge(new Request(`https://matchdayapp.org${path}`), { next: async () => new Response(shell, { headers: { 'content-type': 'text/html' } }) });
    return res.text();
  };
  it('has real text instead of the JavaScript warning, plus title, icons and site name', async () => {
    const html = await run('/');
    expect(html).not.toContain('You need to enable JavaScript');
    expect(html).toContain('<h1>MATCHDAY: Football Organiser · No chasing, no no-shows</h1>');
    expect(html).toContain('<title>MATCHDAY: Football Organiser · No chasing, no no-shows</title>');
    expect(html).toContain('href="/icon-192.png"');
    expect(html).not.toContain('favicon.ico');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    expect(ld[0]).toMatchObject({ '@type': 'WebSite', name: 'MATCHDAY' });
    expect(ld[1].logo).toBe('https://matchdayapp.org/icon-512.png');
  });
  it('other pages get their own text and no site-wide structured data', async () => {
    const html = await run('/help');
    expect(html).toContain('<h1>Help &amp; FAQ · MATCHDAY</h1>');
    expect(html).not.toContain('application/ld+json');
  });
});

describe('invite previews are safe from injected HTML (audit)', () => {
  const shell = '<html><head><title>MATCHDAY</title></head><body><div id="root"></div></body></html>';
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
  const run = async (preview: unknown) => {
    (globalThis as any).Netlify = { env: { get: (k: string) => (k === 'EXPO_PUBLIC_SUPABASE_URL' ? 'https://example.supabase.co' : 'anon') } };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(preview), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
    try {
      const res = await edge(new Request('https://matchdayapp.org/invite/Ab12Cd34'), { next: async () => new Response(shell, { headers: { 'content-type': 'text/html' } }) });
      return res.text();
    } finally { globalThis.fetch = realFetch; }
  };
  it.each([
    ['game', { kind: 'session', name: evil, format_size: 5, places_left: 2, price_pence: 0, venue: evil, area: evil }],
    ['group', { kind: 'group', name: evil, members: 3, area: evil }],
    ['friend', { kind: 'friend', name: evil, username: evil, card_image: evil }],
  ])('%s names can’t inject tags or scripts', async (_k, preview) => {
    const html = await run(preview);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/content="[^"]*"><script/);
    expect(html).toContain('&lt;script&gt;');
  });
});
