/**
 * Booking fee: paid by the player on top of the host's price. It goes to the app owner and
 * covers card processing; the host always receives their full price.
 * fee = max(minimum, ceil((amount × rate + fixed) / (1 − rate)))
 * Mirrors supabase/functions/_shared/payments-core.ts → bookingFee().
 */
export interface FeeConfig {
  rateBps: number;
  fixedPence: number;
  minPence: number;
}

export const DEFAULT_FEES: FeeConfig = { rateBps: 150, fixedPence: 20, minPence: 50 };

export function bookingFee(amountPence: number, cfg: FeeConfig = DEFAULT_FEES): number {
  if (amountPence <= 0) return 0;
  const rate = Math.max(0, cfg.rateBps) / 10_000;
  const covering = rate > 0 || cfg.fixedPence > 0 ? Math.ceil((amountPence * rate + Math.max(0, cfg.fixedPence)) / (1 - rate)) : 0;
  return Math.max(Math.max(0, cfg.minPence), covering);
}

/** What a player pays for a given host price. */
export function playerPrice(hostPence: number, cfg: FeeConfig = DEFAULT_FEES) {
  const fee = bookingFee(hostPence, cfg);
  return { hostPence, feePence: fee, totalPence: hostPence + fee };
}
