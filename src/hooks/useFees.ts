import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEFAULT_FEES, playerPrice, type FeeConfig } from '@/domain/fees';
import { formatPence } from '@/domain/format';

/** Booking-fee settings (from app_settings). Falls back to the defaults while loading. */
export function useFees(): FeeConfig {
  const q = useQuery({
    queryKey: ['app-settings'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('*').maybeSingle();
      return data ? { rateBps: data.booking_fee_rate_bps, fixedPence: data.booking_fee_fixed_pence, minPence: data.booking_fee_min_pence } : DEFAULT_FEES;
    },
  });
  return q.data ?? DEFAULT_FEES;
}

/** "£9.50" + "incl. 60p booking fee" for a host price, using the live fee settings. */
export function usePriceLabel() {
  const fees = useFees();
  return (hostPence: number) => {
    const p = playerPrice(hostPence, fees);
    return {
      ...p,
      total: formatPence(p.totalPence),
      detail: p.feePence > 0 ? `incl. ${formatPence(p.feePence)} booking fee` : '',
      breakdown: p.feePence > 0 ? `${formatPence(p.hostPence)} to the host + ${formatPence(p.feePence)} booking fee` : formatPence(p.hostPence),
    };
  };
}
