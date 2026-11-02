import { bookingFee, playerPrice } from '../fees';
import { bookingFee as serverBookingFee } from '../../../supabase/functions/_shared/payments-core';

describe('booking fee', () => {
  it('is at least 50p and rises only when card costs would be higher', () => {
    expect(bookingFee(300)).toBe(50);
    expect(bookingFee(900)).toBe(50);
    expect(bookingFee(2000)).toBe(51); // (30 + 20) / 0.985 = 50.8 → 51p
    expect(bookingFee(5000)).toBe(97);
    expect(bookingFee(0)).toBe(0);
  });
  it('never loses money after Stripe’s 1.5% + 20p', () => {
    for (const amount of [100, 450, 900, 1250, 3000, 9999]) {
      const fee = bookingFee(amount);
      expect(fee - Math.round((amount + fee) * 0.015 + 20)).toBeGreaterThanOrEqual(0);
    }
  });
  it('shows the all-in price for any host price', () => {
    expect(playerPrice(750)).toEqual({ hostPence: 750, feePence: 50, totalPence: 800 });
    expect(playerPrice(0)).toEqual({ hostPence: 0, feePence: 0, totalPence: 0 });
  });
  it('matches the server calculation', () => {
    for (const amount of [100, 900, 2000, 5000]) expect(serverBookingFee(amount, 150, 20, 50)).toBe(bookingFee(amount));
  });
  it('can be switched off', () => {
    expect(bookingFee(900, { rateBps: 0, fixedPence: 0, minPence: 0 })).toBe(0);
  });
});
