import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Card, IconButton, Row, Screen, SectionTitle, Text, useConfirm, useToast } from '@/components/ui';
import { useTemplates } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { q } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { usePriceLabel } from '@/hooks/useFees';
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

function Action({ icon, title, body, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} variant={primary ? 'highlight' : 'default'} accessibilityLabel={title}>
      <Row gap={space.md}>
        <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: primary ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={24} color={primary ? colors.onPrimary : colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{title}</Text>
          <Text variant="small" tone="muted">{body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Row>
    </Card>
  );
}

export default function Create() {
  const { colors } = useTheme();
  const templates = useTemplates();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const price = usePriceLabel();

  const remove = async (t: { id: string; name: string }) => {
    if (!(await confirm({ title: `Remove the “${t.name}” preset?`, message: 'Games already made from it aren’t affected.', confirmLabel: 'Remove', destructive: true }))) return;
    try {
      await q(supabase.from('session_templates').delete().eq('id', t.id));
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Preset removed');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }}>
        <Text variant="h1" accessibilityRole="header">Create</Text>
        <ScreenHelp id="create" ready={!templates.isLoading} />
      </Row>
      {!!templates.data?.length && (
        <View style={{ gap: space.sm }}>
          <Spot id="create.presets"><SectionTitle title="Presets" /></Spot>
          {templates.data.map((t) => (
            <Card key={t.id} onPress={() => router.push({ pathname: '/session/new', params: { templateId: t.id } })} accessibilityLabel={`New session from ${t.name}`}>
              <Row gap={space.md}>
                <Ionicons name="star" size={20} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{t.name}</Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {t.format_size}-a-side · {String(t.start_time).slice(0, 5)}{t.venue ? ` · ${t.venue}` : ''}{t.payment_mode !== 'free' ? ` · ${price(t.price_pence).total}` : ''}
                  </Text>
                </View>
                <IconButton icon="close" label={`Remove the ${t.name} preset`} size={32} onPress={() => remove(t)} />
              </Row>
            </Card>
          ))}
        </View>
      )}
      <View style={{ gap: space.md }}>
        <Spot id="create.session"><Action icon="add-circle" title="New session" body="Pick a date, format and invite your squad." onPress={() => router.push('/session/new')} primary /></Spot>
        <Spot id="create.group"><Action icon="people" title="New group" body="A squad with its own tables and seasons." onPress={() => router.push('/group/new')} /></Spot>
        <Action icon="person-add" title="Invite friends" body="Search by username or share your QR code." onPress={() => router.push('/friends')} />
      </View>
      {!templates.data?.length && (
        <Text variant="caption" tone="faint">Tip: tap ☆ when creating a session (or on a game you host) to save it as a preset for next time.</Text>
      )}
    </Screen>
  );
}
