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
    expect(html).toContain('<h1>MATCHDAY: Football Organiser · Your weekly game, sorted</h1>');
    expect(html).toContain('<title>MATCHDAY: Football Organiser · Your weekly game, sorted</title>');
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
