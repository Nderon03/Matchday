import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, Screen } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen>
      <View style={{ paddingTop: 80 }}>
        <EmptyState icon="help-buoy-outline" title="Page not found" message="That page doesn’t exist or has moved." />
        <Button title="Back to home" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
