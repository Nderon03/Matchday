import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Row, Screen, SectionTitle, Text, useToast } from '@/components/ui';
import { useMySessions, useTemplates } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { rpc } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { formatKickoff } from '@/domain/format';
import { usePriceLabel } from '@/hooks/useFees';
import { sameWeekdayNextWeek } from '@/features/sessionDates';
import { useQueryClient } from '@tanstack/react-query';

function Action({ icon, title, body, onPress, primary, busy }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void; primary?: boolean; busy?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card onPress={busy ? undefined : onPress} variant={primary ? 'highlight' : 'default'} accessibilityLabel={title}>
      <Row gap={space.md}>
        <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: primary ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={24} color={primary ? colors.onPrimary : colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{busy ? 'Working…' : title}</Text>
          <Text variant="small" tone="muted">{body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Row>
    </Card>
  );
}

export default function Create() {
  const { userId } = useAuth();
  const sessions = useMySessions();
  const templates = useTemplates();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const price = usePriceLabel();
  const lastHosted = sessions.data?.filter((s) => s.host_id === userId && s.status !== 'cancelled').sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];

  const repeat = async () => {
    if (!lastHosted) return;
    setBusy('repeat');
    try {
      const when = sameWeekdayNextWeek(lastHosted.starts_at);
      const id = await rpc<string>('duplicate_session', { p_session: lastHosted.id, p_starts_at: when.toISOString() });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(`Created for ${formatKickoff(when.toISOString())}. Invites sent.`);
      router.push(`/session/${id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const fromTemplate = async (t: any) => {
    setBusy(t.id);
    try {
      router.push({ pathname: '/session/new', params: { templateId: t.id } });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Text variant="h1" accessibilityRole="header" style={{ paddingTop: space.sm }}>Create</Text>
      <View style={{ gap: space.md }}>
        {!!lastHosted && (
          <Action
            primary
            icon="repeat"
            title={`Repeat “${lastHosted.name}”`}
            body={`Same venue, format and squad · ${formatKickoff(sameWeekdayNextWeek(lastHosted.starts_at).toISOString())}`}
            onPress={repeat}
            busy={busy === 'repeat'}
          />
        )}
        <Action icon="add-circle" title="New session" body="Pick a date, format and invite your squad." onPress={() => router.push('/session/new')} primary={!lastHosted} />
        <Action icon="people" title="New group" body="Create a squad with its own leaderboards and seasons." onPress={() => router.push('/group/new')} />
        <Action icon="person-add" title="Invite friends" body="Search by username or share your QR code." onPress={() => router.push('/friends')} />
      </View>
      {!!templates.data?.length && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Saved templates" />
          {templates.data.map((t) => (
            <Card key={t.id} onPress={() => fromTemplate(t)}>
              <Row gap={space.md}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{t.name}</Text>
                  <Text variant="small" tone="muted">
                    {t.format_size}-a-side · {t.recurrence !== 'none' ? `${t.recurrence} · ` : ''}{String(t.start_time).slice(0, 5)}
                    {t.venue ? ` · ${t.venue}` : ''}{t.payment_mode !== 'free' ? ` · ${price(t.price_pence).total} per player` : ''}
                  </Text>
                </View>
                <Text variant="smallStrong" tone="primary">Use</Text>
              </Row>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
