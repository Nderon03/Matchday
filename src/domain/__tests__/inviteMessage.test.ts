import { gameInviteMessage, groupInviteMessage, mateInviteMessage, whatsappUrl } from '../inviteMessage';

const URL = 'https://matchdayapp.org/invite/abc123';

describe('starter kit messages', () => {
  it('group message names the group and puts the link on its own line', () => {
    const m = groupInviteMessage('Wednesday Football', URL);
    expect(m.split('\n')[0]).toBe("⚽ We're running Wednesday Football on MATCHDAY from now on.");
    expect(m).toContain(`Tap to join the group: ${URL}`);
  });
  it('game message has when, where, places and price', () => {
    const m = gameInviteMessage({ name: 'Weds 5s', starts_at: '2026-11-11T19:00:00Z', venue: 'Riverside', format_size: 5, places_left: 2, price_pence: 600 }, URL);
    expect(m).toContain('Weds 5s: Wednesday 11 Nov');
    expect(m).toContain('at Riverside');
    expect(m).toContain('5-a-side · 2 places left · £6 each');
    expect(m.endsWith(URL)).toBe(true);
  });
  it('full and free games read right', () => {
    const m = gameInviteMessage({ name: 'Sunday', starts_at: '2026-11-15T10:00:00Z', places_left: 0, price_pence: 0 }, URL);
    expect(m).toContain('full, join the waiting list');
    expect(m).not.toContain('£');
  });
  it('WhatsApp link encodes the message', () => {
    expect(whatsappUrl('a b\n&')).toBe('https://wa.me/?text=a%20b%0A%26');
  });
  it('bring a mate: personal, with places left and the link', () => {
    const m = mateInviteMessage({ name: 'Weds 5s', starts_at: '2026-11-11T19:00:00Z', venue: 'Riverside', format_size: 5, places_left: 2, price_pence: 600 }, URL);
    expect(m).toContain("I'm playing Weds 5s on Wednesday 11 Nov");
    expect(m).toContain('We need 2 more for 5-a-side. Fancy it?');
    expect(m).toContain('£6 each.');
    expect(m.endsWith(URL)).toBe(true);
  });
});
