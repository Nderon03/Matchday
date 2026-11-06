import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, ErrorState, Header, Loading, Row, Screen, SectionTitle, StatTile, Text, useToast } from '@/components/ui';
import { PaymentBadge, paymentLabel } from '@/components/football/PaymentBadge';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { useAuth } from '@/providers/AuthProvider';
import { invoke, q, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatKickoff, formatPence } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { Payment } from '@/types/db';
import * as Clipboard from 'expo-clipboard';
import { appLink } from '@/lib/links';
import { usePriceLabel } from '@/hooks/useFees';
import { TickBurst } from '@/features/moments/TickBurst';
import { ScreenHelp } from '@/features/ScreenHelp';

interface PaymentQuote { lines: { label: string; amount_pence: number; kind: 'session' | 'guest' | 'fine' | 'fee' }[]; host_receives_pence: number; booking_fee_pence: number; total_pence: number }

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
    queryFn: () => q<Payment[]>(supabase.from('payments').select('*').eq('session_id', id).eq('payer_id', userId!)),
    refetchInterval: (query) => (query.state.data?.some((x) => x.status === 'pending') ? 4000 : false),
  });
  const sessionBill = mine.data?.find((x) => x.kind === 'session') ?? null;
  const fineBills = (mine.data ?? []).filter((x) => x.kind === 'fine');
  const guestBills = (mine.data ?? []).filter((x) => x.kind === 'guest');
  const myGuests = (detail.data?.guests ?? []).filter((g) => g.added_by === userId && g.status === 'confirmed').length;
  // itemised bill (session fee + late fines + booking fee) before paying
  const quote = useQuery({
    queryKey: ['payment-quote', id, sessionBill?.id ?? null, sessionBill?.amount_pence ?? null, myGuests],
    enabled: !!userId && !!detail.data && detail.data.session.payment_mode !== 'free' && detail.data.session.host_id !== userId
      && !(sessionBill && ['paid', 'authorised', 'partially_refunded', 'refunded'].includes(sessionBill.status)),
    retry: false,
    queryFn: () => invoke<PaymentQuote>('payments-checkout', { session_id: id, quote: true }),
  });
  const [opening, setOpening] = useState(false);
  const toast = useToast();
  const price = usePriceLabel();

  if (detail.isLoading) return <Screen><Header title="Payments" /><Loading /></Screen>;
  if (!d) return <Screen><Header title="Payments" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  const s = d.session;
  const p = sessionBill;
  const isHostSelf = s.host_id === userId;

  const pay = async (paymentId?: string) => {
    setOpening(true);
    const r = await run('pay', () => invoke<{ url?: string; already_paid?: boolean }>('payments-checkout', { session_id: id, ...(paymentId ? { payment_id: paymentId } : {}) }));
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
      <Header title="Payments" subtitle={`${s.name} · ${price(s.price_pence).total} per player`} right={<ScreenHelp id="session-payments" />} />

      {checkout === 'success' && (p?.status === 'paid' || p?.status === 'authorised') && (
        <Card variant="highlight">
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <TickBurst size={56} />
            <Text variant="h3" align="center">{p.status === 'paid' ? 'You’re paid up' : 'You’re all set'}</Text>
            <Text variant="small" tone="muted" align="center">
              {p.status === 'paid' ? `Thanks! Your place for ${s.name} is paid.` : `Your card is held and only charged once the host confirms ${s.name} took place.`}
            </Text>
          </View>
        </Card>
      )}
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
                  {myGuests > 0 ? ` Includes your ${myGuests === 1 ? 'guest' : `${myGuests} guests`}.` : ''}
                </Text>
              </View>
              <Text variant="h2">{formatPence(quote.data?.total_pence ?? p?.amount_pence ?? s.price_pence)}</Text>
            </Row>
            {!!quote.data && quote.data.lines.length > 1 && (
              <View style={{ gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
                {quote.data.lines.map((l, i) => (
                  <Row key={i} style={{ justifyContent: 'space-between' }}>
                    <Text variant="small" tone={l.kind === 'fine' ? 'warning' : l.kind === 'fee' ? 'muted' : 'default'} style={{ flex: 1 }}>{l.label}</Text>
                    <Text variant="smallStrong">{formatPence(l.amount_pence)}</Text>
                  </Row>
                ))}
                <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2 }}>
                  <Text variant="smallStrong">Total</Text>
                  <Text variant="smallStrong">{formatPence(quote.data.total_pence)}</Text>
                </Row>
                {quote.data.booking_fee_pence > 0 && <Text variant="caption" tone="faint">The booking fee covers card processing, so the host receives the full amount.</Text>}
              </View>
            )}
            {!!(p?.failure_reason) && p.status === 'failed' && <Text variant="small" tone="danger">{p.failure_reason}</Text>}
            {(!p || ['unpaid', 'failed', 'pending', 'cancelled'].includes(p.status)) && p?.method !== 'cash' && (
              <Button title={p?.status === 'failed' ? 'Try again' : p?.status === 'pending' ? 'Resume payment' : 'Pay now'} icon="lock-closed" size="lg" loading={opening || busy === 'pay'} onPress={() => pay()}
                disabled={s.status === 'cancelled' || (s.payment_mode === 'upfront' && d.me?.status !== 'confirmed')} />
            )}
            {s.payment_mode === 'upfront' && d.me?.status !== 'confirmed' && !p && <Text variant="caption" tone="muted">Confirm your place to pay.</Text>}
            {!!(p?.receipt_url) && <Button title="View receipt" variant="ghost" icon="receipt-outline" onPress={() => Linking.openURL(p.receipt_url!)} />}
            <Text variant="caption" tone="faint">Pay by card, Apple Pay or Google Pay — processed by Stripe. MATCHDAY never sees or stores your card details. A status only changes once Stripe confirms it.</Text>
          </View>
        </Card>
      )}

      {guestBills.map((gb) => (
        <Card key={gb.id} variant={gb.status === 'paid' ? 'default' : 'highlight'}>
          <Row gap={space.md}>
            <PaymentBadge status={gb.status} size={24} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Guest fee · {gb.guest_count} {gb.guest_count === 1 ? 'guest' : 'guests'}</Text>
              <Text variant="small" tone="muted">{['unpaid', 'failed', 'pending'].includes(gb.status) ? 'You added guests after paying for yourself, so they’re billed separately. Charged straight away.' : paymentLabel(gb.status)}</Text>
            </View>
            <Text variant="h3">{formatPence(gb.amount_pence)}</Text>
          </Row>
          {['unpaid', 'failed', 'pending'].includes(gb.status) && gb.method !== 'cash' && (
            <Button title="Pay guest fee" icon="lock-closed" style={{ marginTop: space.md }} loading={opening} onPress={() => pay(gb.id)} />
          )}
        </Card>
      ))}

      {fineBills.map((fb) => (
        <Card key={fb.id} variant={fb.status === 'paid' ? 'default' : 'highlight'}>
          <Row gap={space.md}>
            <PaymentBadge status={fb.status} size={24} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Late fines</Text>
              <Text variant="small" tone="muted">{paymentLabel(fb.status)}</Text>
            </View>
            <Text variant="h3">{formatPence(fb.amount_pence)}</Text>
          </Row>
          {['unpaid', 'failed', 'pending'].includes(fb.status) && (
            <Button title="Pay late fines" icon="lock-closed" style={{ marginTop: space.md }} loading={opening} onPress={() => pay(fb.id)} />
          )}
        </Card>
      ))}

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
              <Text variant="caption" tone="muted">
                You receive {formatPence(s.price_pence)} per player (plus any late fines). Players pay for guests they bring; your own guests are free. Players pay {price(s.price_pence).total}: the {formatPence(price(s.price_pence).feePence)} booking fee goes to MATCHDAY and covers card processing.
              </Text>
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
                      <Text variant="caption" tone="muted">{paymentLabel(pl.status)}{pl.method === 'cash' ? ' (cash)' : ''}{pl.guest_count ? ` · incl. ${pl.guest_count} guest${pl.guest_count > 1 ? 's' : ''}` : ''}{pl.fines_pence ? ` · incl. ${formatPence(pl.fines_pence)} late fine` : ''}{pl.refunded ? ` · ${formatPence(pl.refunded)} refunded` : ''}</Text>
                      {!!pl.guest_payment_id && (
                        <Text variant="caption" tone={['unpaid', 'failed', 'pending'].includes(pl.guest_status) ? 'warning' : 'muted'}>
                          Guest fee ({pl.guest_bill_count}): {formatPence(pl.guest_amount_pence)} · {paymentLabel(pl.guest_status)}
                        </Text>
                      )}
                    </View>
                    <PaymentBadge status={pl.status} />
                    {(['unpaid', 'failed'].includes(pl.status) || ['unpaid', 'failed'].includes(pl.guest_status)) && (
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
              <Button title="Copy payment link for the group chat" icon="link-outline" variant="secondary" onPress={async () => {
                await Clipboard.setStringAsync(appLink(`/session/${id}/payments`));
                toast.success('Payment link copied — paste it in your group chat');
              }} />
              <Badge label="Funds settle directly to your Stripe account" tone="neutral" />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}
