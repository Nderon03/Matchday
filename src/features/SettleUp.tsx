import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Row, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { formatDate, formatPence } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export interface OutstandingBill {
  payment_id: string;
  session_id: string;
  session_name: string;
  played_at: string;
  kind: 'session' | 'fine' | 'guest';
  amount_pence: number;
  status: string;
}

/** The current player's unpaid bills in a group. */
export function useMyOutstanding(groupId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['outstanding', groupId],
    enabled: !!groupId && enabled,
    queryFn: () => rpc<OutstandingBill[]>('get_my_outstanding', { p_group: groupId }),
  });
}

/** Host/admin view of who owes what in a group: user id → pence. */
export function useGroupBalances(groupId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['balances', groupId],
    enabled: !!groupId && enabled,
    retry: false,
    queryFn: async () => {
      const rows = await rpc<{ user_id: string; unpaid_pence: number; owed_fines_pence: number }[]>('get_group_balances', { p_group: groupId });
      return new Map(rows.filter((r) => r.unpaid_pence > 0).map((r) => [r.user_id, r.unpaid_pence]));
    },
  });
}

/** Shown instead of "I'm in" when a player owes money from earlier games in the group. */
export function SettleUpCard({ bills }: { bills: OutstandingBill[] }) {
  const { colors } = useTheme();
  const total = bills.reduce((a, b) => a + b.amount_pence, 0);
  return (
    <Card style={{ borderColor: colors.warning, backgroundColor: colors.warningMuted }}>
      <View style={{ gap: space.md }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Ionicons name="wallet-outline" size={24} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3">Settle up to join</Text>
            <Text variant="small" tone="muted">
              You owe {formatPence(total)} from earlier games in this group. Pay it here, or ask the host to mark it as paid in cash, then you can join.
            </Text>
          </View>
        </Row>
        {bills.map((b) => (
          <Row key={b.payment_id} gap={space.md}>
            <View style={{ flex: 1 }}>
              <Text variant="smallStrong">{b.kind === 'fine' ? 'Late fines' : b.kind === 'guest' ? `Guest fee · ${b.session_name}` : b.session_name}</Text>
              <Text variant="caption" tone="muted">{formatDate(b.played_at)}</Text>
            </View>
            <Text variant="smallStrong">{formatPence(b.amount_pence)}</Text>
            <Button title="Pay" size="sm" onPress={() => router.push(`/session/${b.session_id}/payments`)} />
          </Row>
        ))}
      </View>
    </Card>
  );
}
