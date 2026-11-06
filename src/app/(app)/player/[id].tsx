import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/ui';
import { PlayerProfileView } from '@/features/PlayerProfileView';
import { ScreenHelp } from '@/features/ScreenHelp';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Player" right={<ScreenHelp id="player" />} />
      <PlayerProfileView userId={id} />
    </Screen>
  );
}
