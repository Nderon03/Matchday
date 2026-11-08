import React from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, ErrorState, Header, Row, Screen, SectionTitle, SkeletonList, StatTile, Text } from '@/components/ui';
import { PaymentBadge, paymentLabel } from '@/components/football/PaymentBadge';
import { useMyPayments } from '@/hooks/queries';
import { formatDate, formatPence } from '@/domain/format';
import { space } from '@/theme/tokens';
import { ScreenHelp } from '@/features/ScreenHelp';

export default function MyPayments() {
  const payments = useMyPayments();
  const list = payments.data ?? [];
  const outstanding = list.filter((p) => ['unpaid', 'failed'].includes(p.status));
  const paid = list.filter((p) => ['paid', 'partially_refunded'].includes(p.status));
  return (
    <Screen edges={['top', 'bottom']} onRefresh={payments.refetch} refreshing={payments.isRefetching}>
      <Header title="Payments" right={<ScreenHelp id="payments" />} />
      {!!payments.isLoading && <SkeletonList />}
      {!!payments.error && <ErrorState error={payments.error} onRetry={payments.refetch} />}
      {!!payments.data && (
        <Row gap={space.sm}>
          <StatTile compact label="Outstanding" value={formatPence(outstanding.reduce((a, p) => a + p.amount_pence, 0))} />
          <StatTile compact label="Paid (all time)" value={formatPence(paid.reduce((a, p) => a + p.amount_pence, 0))} accent />
        </Row>
      )}
      {payments.data?.length === 0 && <EmptyState icon="card-outline" title="No payments yet" message="Game fees you pay through MATCHDAY show up here, with receipts." />}
      {outstanding.length > 0 && <SectionTitle title="Outstanding" />}
      {[...outstanding, ...list.filter((p) => !outstanding.includes(p))].map((p, i) => (
        <React.Fragment key={p.id}>
          {i === outstanding.length && outstanding.length > 0 && <SectionTitle title="History" />}
          <Card onPress={() => router.push(`/session/${p.session_id}/payments`)}>
            <Row gap={space.md}>
              <PaymentBadge status={p.status} size={22} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{p.session?.name}</Text>
                <Text variant="caption" tone="muted">{p.session ? formatDate(p.session.starts_at) : ''} · {paymentLabel(p.status)}{p.method === 'cash' ? ' (cash)' : ''}</Text>
                {!!p.receipt_url && <Text variant="caption" tone="primary" onPress={() => Linking.openURL(p.receipt_url!)}>View receipt</Text>}
              </View>
              <Text variant="statSmall">{formatPence(p.amount_pence)}</Text>
            </Row>
          </Card>
        </React.Fragment>
      ))}
    </Screen>
  );
}
