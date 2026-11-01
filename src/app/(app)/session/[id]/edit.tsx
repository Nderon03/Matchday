import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ErrorState, Header, Loading, Screen } from '@/components/ui';
import { SessionForm } from '@/features/SessionForm';
import { useSessionDetail } from '@/hooks/queries';

export default function EditSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useSessionDetail(id);
  if (detail.isLoading) return <Screen><Header title="Edit session" /><Loading /></Screen>;
  if (!detail.data) return <Screen><Header title="Edit session" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  const s = detail.data.session;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={720}>
      <Header title="Edit session" />
      <SessionForm
        editing={s}
        initial={{ ...s, invitee_ids: detail.data.invited.map((p) => p.id) }}
      />
    </Screen>
  );
}
