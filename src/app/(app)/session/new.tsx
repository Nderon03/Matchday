import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Header, Loading, Screen } from '@/components/ui';
import { SessionForm, type SessionFormInitial } from '@/features/SessionForm';
import { supabase } from '@/lib/supabase';
import { q } from '@/lib/api';
import { nextDays } from '@/features/sessionDates';
import { ScreenHelp } from '@/features/ScreenHelp';

export default function NewSession() {
  const { templateId, groupId } = useLocalSearchParams<{ templateId?: string; groupId?: string }>();
  const template = useQuery({
    queryKey: ['template', templateId],
    enabled: !!templateId,
    queryFn: () => q<any>(supabase.from('session_templates').select('*').eq('id', templateId!).single()),
  });
  if (templateId && template.isLoading) return <Screen><Header title="New session" /><Loading /></Screen>;
  let initial: SessionFormInitial | undefined = groupId ? { group_id: groupId, visibility: 'group' } : undefined;
  const t = template.data;
  if (t) {
    // default to tomorrow at the template's kick-off time; the host picks the day with one tap
    const [h, m] = String(t.start_time).split(':').map(Number);
    const day = nextDays(2)[1];
    day.setHours(h, m, 0, 0);
    initial = {
      name: t.name, group_id: t.group_id, starts_at: day.toISOString(), duration_minutes: t.duration_minutes, location: t.location, venue: t.venue, postcode: t.postcode, latitude: t.latitude, longitude: t.longitude,
      format_size: t.format_size, max_attendance: t.max_attendance ?? t.format_size * 2, visibility: t.visibility, description: t.description,
      payment_mode: t.payment_mode, price_pence: t.price_pence, invitee_ids: t.invitee_ids, template_id: t.id,
    };
  }
  return (
    <Screen edges={['top', 'bottom']} maxWidth={720}>
      <Header title={t ? `New: ${t.name}` : 'New session'} subtitle="Takes about 30 seconds" right={<ScreenHelp id="session-new" />} />
      <SessionForm initial={initial} />
    </Screen>
  );
}
