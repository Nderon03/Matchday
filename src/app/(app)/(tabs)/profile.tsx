import React from 'react';
import { router } from 'expo-router';
import { IconButton, Row, Screen, Text } from '@/components/ui';
import { PlayerProfileView } from '@/features/PlayerProfileView';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';
import { useQueryClient } from '@tanstack/react-query';

export default function ProfileTab() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return (
    <Screen onRefresh={() => qc.invalidateQueries({ queryKey: ['player', userId] })}>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }}>
        <Text variant="h1" accessibilityRole="header">Profile</Text>
        <Row>
          <IconButton icon="card-outline" label="Payments" onPress={() => router.push('/payments')} />
          <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
        </Row>
      </Row>
      {!!userId && <PlayerProfileView userId={userId} />}
    </Screen>
  );
}
