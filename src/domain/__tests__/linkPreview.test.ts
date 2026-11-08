import { describe as describePreview, pageText } from '../../../netlify/edge-functions/link-preview';

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
