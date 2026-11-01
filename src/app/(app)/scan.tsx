import React, { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, EmptyState, Header, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Scan a MATCHDAY invite QR code (friend, group or session). */
export default function Scan() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  if (Platform.OS === 'web') {
    return <Screen edges={['top', 'bottom']}><Header title="Scan invite" /><EmptyState icon="qr-code-outline" title="Scanning works in the mobile app" message="On the web, open the invite link directly." /></Screen>;
  }
  if (!permission) return <Screen><Header title="Scan invite" /></Screen>;
  if (!permission.granted) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Scan invite" />
        <EmptyState icon="camera-outline" title="Camera access needed" message="Allow camera access to scan a friend’s or group’s QR code." action={{ label: 'Allow camera', onPress: requestPermission }} />
      </Screen>
    );
  }
  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
      <Header title="Scan invite" />
      <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: colors.primary, marginVertical: space.lg }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (handled.current) return;
            const match = /\/invite\/([a-f0-9]{8,64})/i.exec(data);
            if (!match) return setError('That QR code isn’t a MATCHDAY invite.');
            handled.current = true;
            router.replace(`/invite/${match[1]}`);
          }}
        />
      </View>
      {error ? <Text tone="danger" align="center">{error}</Text> : <Text tone="muted" align="center">Point your camera at a MATCHDAY QR code.</Text>}
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
