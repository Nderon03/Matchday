import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, ErrorState, Header, Loading, Row, Screen, Text, useToast } from '@/components/ui';
import { invoke } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface Status { connected: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean; requirements?: string[] }

export default function Payouts() {
  const { colors } = useTheme();
  const toast = useToast();
  const status = useQuery({ queryKey: ['payouts-status'], queryFn: () => invoke<Status>('stripe-connect', { action: 'status' }), retry: false });
  const [busy, setBusy] = useState(false);
  const open = async (action: 'onboard' | 'dashboard') => {
    setBusy(true);
    try {
      const { url } = await invoke<{ url: string }>('stripe-connect', { action });
      if (Platform.OS === 'web') window.location.assign(url);
      else { await WebBrowser.openBrowserAsync(url); status.refetch(); }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const s = status.data;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={600} onRefresh={status.refetch} refreshing={status.isRefetching}>
      <Header title="Payouts" />
      <Card variant="alt">
        <View style={{ gap: space.sm }}>
          <Row gap={space.sm}><Ionicons name="shield-checkmark" size={18} color={colors.primary} /><Text variant="bodyStrong">Powered by Stripe Connect</Text></Row>
          <Text variant="small" tone="muted">Player payments go directly to your own Stripe account. Stripe verifies your identity and pays out to your bank. MATCHDAY never holds your money or sees card details.</Text>
        </View>
      </Card>
      {!!status.isLoading && <Loading />}
      {!!status.error && <ErrorState error={status.error} onRetry={status.refetch} />}
      {!!s && (
        <Card>
          <View style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h3">Status</Text>
              {!s.connected ? <Badge label="Not set up" /> : s.charges_enabled && s.payouts_enabled ? <Badge label="Active" tone="success" /> : <Badge label="Action needed" tone="warning" />}
            </Row>
            {!!s.connected && (
              <View style={{ gap: 4 }}>
                <Text variant="small">Accept payments: {s.charges_enabled ? 'Yes' : 'Not yet'}</Text>
                <Text variant="small">Payouts to bank: {s.payouts_enabled ? 'Yes' : 'Not yet'}</Text>
                {!!s.requirements?.length && <Text variant="small" tone="warning">Stripe needs: {s.requirements.join(', ').replace(/_/g, ' ')}</Text>}
              </View>
            )}
            {!s.connected || !s.details_submitted || !s.charges_enabled ? (
              <Button title={s.connected ? 'Continue setup' : 'Set up payouts'} icon="open-outline" loading={busy} onPress={() => open('onboard')} />
            ) : (
              <Button title="Open Stripe dashboard" variant="secondary" icon="open-outline" loading={busy} onPress={() => open('dashboard')} />
            )}
          </View>
        </Card>
      )}
    </Screen>
  );
}
