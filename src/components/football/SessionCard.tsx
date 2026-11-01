import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Badge, Card, Row, Text } from '@/components/ui';
import { formatKickoff, formatPence } from '@/domain/format';
import type { Session } from '@/types/db';

export function statusBadge(s: Pick<Session, 'status'>, myStatus?: string) {
  if (s.status === 'cancelled') return <Badge label="Cancelled" tone="danger" />;
  if (s.status === 'finalised') return <Badge label="Full time" tone="neutral" />;
  if (s.status === 'completed') return <Badge label="Voting open" tone="primary" />;
  if (s.status === 'in_progress') return <Badge label="Live" tone="success" />;
  if (myStatus === 'confirmed') return <Badge label="You're in" tone="success" />;
  if (myStatus === 'waitlisted') return <Badge label="Waiting list" tone="warning" />;
  if (myStatus === 'declined' || myStatus === 'unavailable' || myStatus === 'withdrawn') return <Badge label="Not playing" />;
  return <Badge label="Invited" tone="warning" />;
}

export function SessionCard({ session, myStatus, confirmed, groupName }: { session: Session; myStatus?: string; confirmed?: number; groupName?: string | null }) {
  const { colors } = useTheme();
  return (
    <Card onPress={() => router.push(`/session/${session.id}`)} accessibilityLabel={`${session.name}, ${formatKickoff(session.starts_at)}`}>
      <View style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="overline" tone="primary">{session.format_size}-a-side{groupName ? ` · ${groupName}` : ''}</Text>
          {statusBadge(session, myStatus)}
        </Row>
        <Text variant="h3" numberOfLines={1}>{session.name}</Text>
        <Row gap={space.lg} wrap>
          <Row gap={6}><Ionicons name="calendar-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted">{formatKickoff(session.starts_at)}</Text></Row>
          {(session.venue || session.location) && (
            <Row gap={6}><Ionicons name="location-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted" numberOfLines={1}>{session.venue ?? session.location}</Text></Row>
          )}
          {confirmed != null && (
            <Row gap={6}><Ionicons name="people-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted">{confirmed}/{session.max_attendance}</Text></Row>
          )}
          {session.payment_mode !== 'free' && (
            <Row gap={6}><Ionicons name="card-outline" size={15} color={colors.textMuted} /><Text variant="small" tone="muted">{formatPence(session.price_pence)}</Text></Row>
          )}
        </Row>
      </View>
    </Card>
  );
}
