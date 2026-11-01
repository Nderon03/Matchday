import React from 'react';
import { View } from 'react-native';
import { Card, Screen, Text } from '@/components/ui';
import { space } from '@/theme/tokens';

/** Shown when the app is started without Supabase credentials. */
export function SetupRequired() {
  return (
    <Screen>
      <View style={{ gap: space.lg, paddingTop: space.huge }}>
        <Text variant="overline" tone="primary">MATCHDAY</Text>
        <Text variant="h1">Backend not configured</Text>
        <Text tone="muted">
          This build has no Supabase project configured, so it cannot sign you in or load data. MATCHDAY never falls back to fake data.
        </Text>
        <Card>
          <Text variant="smallStrong">Create a <Text variant="smallStrong" tone="primary">.env</Text> file with:</Text>
          <Text variant="small" tone="muted" style={{ marginTop: space.sm, fontFamily: 'monospace' }}>
            EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
          </Text>
        </Card>
        <Text variant="small" tone="faint">See README → “Supabase setup” for the full guide.</Text>
      </View>
    </Screen>
  );
}
