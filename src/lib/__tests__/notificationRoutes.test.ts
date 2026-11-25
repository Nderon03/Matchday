import { routeForNotification } from '../notificationRoutes';

describe('notification taps', () => {
  it('the weekly recap opens your profile', () => {
    expect(routeForNotification({ recap: true })).toBe('/profile');
  });
  it('game notifications open the right part of the game', () => {
    expect(routeForNotification({ session_id: 's1', type: 'voting_open' })).toBe('/session/s1/vote');
    expect(routeForNotification({ session_id: 's1', type: 'payment_required' })).toBe('/session/s1/payments');
    expect(routeForNotification({ session_id: 's1' })).toBe('/session/s1');
  });
  it('nothing to open is fine', () => {
    expect(routeForNotification(undefined)).toBeNull();
    expect(routeForNotification({})).toBeNull();
  });
});
