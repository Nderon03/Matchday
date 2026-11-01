import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, ErrorState, Header, Loading, Row, Screen, SectionTitle, StatTile, Text } from '@/components/ui';
import { PaymentBadge, paymentLabel } from '@/components/football/PaymentBadge';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { useAuth } from '@/providers/AuthProvider';
import { invoke, q, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatKickoff, formatPence } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { Payment } from '@/types/db';

export default function PaymentsScreen() {
  const { id, checkout } = useLocalSearchParams<{ id: string; checkout?: string }>();
  const { userId } = useAuth();
  const { colors } = useTheme();
  const detail = useSessionDetail(id);
  const { run, busy } = useAction([keys.session(id), ['payment-summary', id], ['my-payment', id]]);
  const d = detail.data;
  const summary = useQuery({ queryKey: ['payment-summary', id], enabled: !!d?.isManager, queryFn: () => rpc<any>('get_payment_summary', { p_session: id }), refetchInterval: 15_000 });
  const mine = useQuery({
    queryKey: ['my-payment', id],
    enabled: !!userId,
    queryFn: () => q<Payment | null>(supabase.from('payments').select('*').eq('session_id', id).eq('payer_id', userId!).maybeSingle()),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 4000 : false),
  });
  const [opening, setOpening] = useState(false);

  if (detail.isLoading) return <Screen><Header title="Payments" /><Loading /></Screen>;
  if (!d) return <Screen><Header title="Payments" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  const s = d.session;
  const p = mine.data;
  const isHostSelf = s.host_id === userId;

  const pay = async () => {
    setOpening(true);
    const r = await run('pay', () => invoke<{ url?: string; already_paid?: boolean }>('payments-checkout', { session_id: id }));
    setOpening(false);
    if (r?.url) {
      if (Platform.OS === 'web') window.location.assign(r.url);
      else {
        await WebBrowser.openBrowserAsync(r.url);
        mine.refetch();
      }
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640} onRefresh={() => { mine.refetch(); summary.refetch(); }} refreshing={mine.isRefetching}>
      <Header title="Payments" subtitle={`${s.name} · ${formatPence(s.price_pence)} per player`} />

      {checkout === 'success' && p?.status !== 'paid' && p?.status !== 'authorised' && (
        <Card variant="alt"><Text variant="small">Payment submitted — waiting for Stripe to confirm. This usually takes a few seconds; your status updates automatically.</Text></Card>
      )}
      {checkout === 'cancelled' && <Card variant="alt"><Text variant="small">Checkout was cancelled. You have not been charged.</Text></Card>}

      {!isHostSelf && s.payment_mode !== 'free' && (
        <Card variant={p?.status === 'paid' ? 'default' : 'highlight'}>
          <View style={{ gap: space.md }}>
            <Row gap={space.md}>
              <PaymentBadge status={p?.status} size={28} />
              <View style={{ flex: 1 }}>
                <Text variant="h3">{paymentLabel(p?.status)}</Text>
                <Text variant="small" tone="muted">
                  {s.payment_mode === 'upfront'
                    ? 'Your card is authorised now and charged only after the host confirms the game took place.'
                    : 'Pay your share after the game.'}
                </Text>
              </View>
              <Text variant="h2">{formatPence(p?.amount_pence ?? s.price_pence)}</Text>
            </Row>
            {!!(p?.failure_reason) && p.status === 'failed' && <Text variant="small" tone="danger">{p.failure_reason}</Text>}
            {(!p || ['unpaid', 'failed', 'pending', 'cancelled'].includes(p.status)) && p?.method !== 'cash' && (
              <Button title={p?.status === 'failed' ? 'Try again' : p?.status === 'pending' ? 'Resume payment' : 'Pay with card'} icon="lock-closed" size="lg" loading={opening || busy === 'pay'} onPress={pay}
                disabled={s.status === 'cancelled' || (s.payment_mode === 'upfront' && d.me?.status !== 'confirmed')} />
            )}
            {s.payment_mode === 'upfront' && d.me?.status !== 'confirmed' && !p && <Text variant="caption" tone="muted">Confirm your place to pay.</Text>}
            {!!(p?.receipt_url) && <Button title="View receipt" variant="ghost" icon="receipt-outline" onPress={() => Linking.openURL(p.receipt_url!)} />}
            <Text variant="caption" tone="faint">Payments are processed by Stripe. MATCHDAY never sees or stores your card details. A status only changes once Stripe confirms it.</Text>
          </View>
        </Card>
      )}

      {!!d.isManager && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Host dashboard" />
          {!!summary.isLoading && <Loading />}
          {!!summary.error && <ErrorState error={summary.error} onRetry={summary.refetch} compact />}
          {!!summary.data && (
            <>
              <Row gap={space.sm} wrap>
                <StatTile compact label="Collected" value={formatPence(summary.data.collected_pence)} accent />
                <StatTile compact label="Outstanding" value={formatPence(summary.data.outstanding_pence)} />
                {summary.data.authorised_pence > 0 && <StatTile compact label="Authorised" value={formatPence(summary.data.authorised_pence)} />}
              </Row>
              <Text variant="caption" tone="muted">{summary.data.paid_count} paid · {summary.data.unpaid_count} unpaid · {summary.data.failed_count} failed · {summary.data.refunded_count} refunded</Text>
              {s.payment_mode === 'upfront' && !s.host_confirmed_at && new Date(s.starts_at) < new Date() && (
                <Card variant="highlight">
                  <View style={{ gap: space.sm }}>
                    <Text variant="bodyStrong">Did the game go ahead?</Text>
                    <Text variant="small" tone="muted">Confirm within 24 hours of the scheduled end to collect authorised payments. Absent players’ holds are released. If you don’t confirm, holds are released automatically and you can request payment instead.</Text>
                    <Button title="Yes — confirm & collect" icon="checkmark-done" loading={busy === 'confirm'} onPress={() => run('confirm', () => invoke<any>('payments-host-action', { session_id: id, action: 'confirm' }),
                      (r) => `Captured ${r.captured}, released ${r.released}${r.requested ? `, requested ${r.requested}` : ''}${r.failed ? ` (${r.failed} failed — retrying automatically)` : ''}`)} />
                  </View>
                </Card>
              )}
              {!!s.host_confirmed_at && <Text variant="caption" tone="primary">You confirmed this session on {formatKickoff(s.host_confirmed_at)}.</Text>}
              <Card padded={false}>
                {summary.data.players.map((pl: any, i: number) => (
                  <Row key={pl.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Avatar uri={pl.avatar_url} name={pl.display_name} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{pl.display_name}</Text>
                      <Text variant="caption" tone="muted">{paymentLabel(pl.status)}{pl.method === 'cash' ? ' (cash)' : ''}{pl.refunded ? ` · ${formatPence(pl.refunded)} refunded` : ''}</Text>
                    </View>
                    <PaymentBadge status={pl.status} />
                    {['unpaid', 'failed'].includes(pl.status) && (
                      <Button title="Cash" size="sm" variant="ghost" loading={busy === `cash-${pl.user_id}`} onPress={() => run(`cash-${pl.user_id}`, () => rpc('record_cash_payment', { p_session: id, p_user: pl.user_id }), 'Marked as paid in cash')} />
                    )}
                    {pl.method === 'card' && ['paid', 'authorised', 'partially_refunded'].includes(pl.status) && pl.payment_id && (
                      <Button title={pl.status === 'authorised' ? 'Release' : 'Refund'} size="sm" variant="ghost" loading={busy === `refund-${pl.user_id}`}
                        onPress={() => run(`refund-${pl.user_id}`, () => invoke('payments-host-action', { session_id: id, action: 'refund', payment_id: pl.payment_id }), 'Refund requested — status updates when Stripe confirms')} />
                    )}
                  </Row>
                ))}
                {!summary.data.players.length && <Text tone="muted" style={{ padding: space.lg }}>No players to collect from yet.</Text>}
              </Card>
              <Badge label="Funds settle directly to your Stripe account" tone="neutral" />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}
