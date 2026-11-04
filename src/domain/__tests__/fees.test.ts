import { bookingFee, playerPrice } from '../fees';
import { bookingFee as serverBookingFee } from '../../../supabase/functions/_shared/payments-core';

describe('booking fee', () => {
  it('is at least 60p and rises only when card costs would be higher', () => {
    expect(bookingFee(300)).toBe(60);
    expect(bookingFee(900)).toBe(60);
    expect(bookingFee(2000)).toBe(60); // card cost (30 + 20) / 0.985 = 51p, under the 60p minimum
    expect(bookingFee(3000)).toBe(66); // (45 + 20) / 0.985 = 65.99 → 66p
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
    expect(playerPrice(750)).toEqual({ hostPence: 750, feePence: 60, totalPence: 810 });
    expect(playerPrice(0)).toEqual({ hostPence: 0, feePence: 0, totalPence: 0 });
  });
  it('matches the server calculation', () => {
    for (const amount of [100, 900, 2000, 5000]) expect(serverBookingFee(amount, 150, 20, 60)).toBe(bookingFee(amount));
  });
  it('can be switched off', () => {
    expect(bookingFee(900, { rateBps: 0, fixedPence: 0, minPence: 0 })).toBe(0);
  });
});
