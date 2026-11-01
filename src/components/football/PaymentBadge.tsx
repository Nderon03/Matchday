import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import type { PaymentStatus } from '@/types/db';

/** Green tick = confirmed paid, amber clock = pending/authorised, red cross = unpaid or failed. */
export function PaymentBadge({ status, size = 16 }: { status: PaymentStatus | undefined; size?: number }) {
  const { colors } = useTheme();
  const s = status ?? 'unpaid';
  const [icon, color, label] =
    s === 'paid' || s === 'partially_refunded'
      ? (['checkmark-circle', colors.success, 'Paid'] as const)
      : s === 'pending' || s === 'authorised'
        ? (['time', colors.warning, s === 'authorised' ? 'Card authorised' : 'Payment pending'] as const)
        : s === 'refunded' || s === 'cancelled'
          ? (['return-down-back', colors.textMuted, s === 'refunded' ? 'Refunded' : 'Released'] as const)
          : (['close-circle', colors.danger, s === 'failed' ? 'Payment failed' : s === 'disputed' ? 'Disputed' : 'Unpaid'] as const);
  return (
    <View accessible accessibilityLabel={label}>
      <Ionicons name={icon} size={size} color={color} />
    </View>
  );
}

export function paymentLabel(status: PaymentStatus | undefined) {
  switch (status) {
    case 'paid': return 'Paid';
    case 'authorised': return 'Authorised — charged after the game';
    case 'pending': return 'Pending';
    case 'failed': return 'Failed';
    case 'refunded': return 'Refunded';
    case 'partially_refunded': return 'Partially refunded';
    case 'cancelled': return 'Released (not charged)';
    case 'disputed': return 'Disputed';
    default: return 'Unpaid';
  }
}
