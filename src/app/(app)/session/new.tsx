import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Header, Loading, Screen } from '@/components/ui';
import { SessionForm, type SessionFormInitial } from '@/features/SessionForm';
import { supabase } from '@/lib/supabase';
import { q } from '@/lib/api';
import { nextDays } from '@/features/sessionDates';
import { ScreenHelp } from '@/features/ScreenHelp';

export default function NewSession() {
  const { templateId, groupId, groupName, first } = useLocalSearchParams<{ templateId?: string; groupId?: string; groupName?: string; first?: string }>();
  const template = useQuery({
    queryKey: ['template', templateId],
    enabled: !!templateId,
    queryFn: () => q<any>(supabase.from('session_templates').select('*').eq('id', templateId!).single()),
  });
  if (templateId && template.isLoading) return <Screen><Header title="New game" /><Loading /></Screen>;
  // a group's game is named after the group to start with (one less thing to type)
  let initial: SessionFormInitial | undefined = groupId ? { group_id: groupId, visibility: 'group', ...(groupName ? { name: groupName } : {}) } : undefined;
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
      {first === '1' && groupId ? (
        <>
          <Header title="Your first game" subtitle={`${groupName || 'Your group'} is ready. When do you play?`} right={<ScreenHelp id="session-new" />} />
          <SessionForm initial={initial} />
          <Button title="Skip for now" variant="ghost" onPress={() => router.replace(`/group/${groupId}?new=1`)} />
        </>
      ) : (
        <>
          <Header title={t ? `New: ${t.name}` : 'New game'} subtitle="Takes about 30 seconds" right={<ScreenHelp id="session-new" />} />
          <SessionForm initial={initial} />
        </>
      )}
    </Screen>
  );
}
