import React, { useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useOffline } from '@/lib/offline';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

/** A small pill near the bottom (above the tab bar) while there's no connection: you're seeing what was saved. */
export function OfflineBanner() {
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [show] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(show, { toValue: offline ? 1 : 0, duration: 220, useNativeDriver: native }).start();
  }, [offline, show]);
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', bottom: insets.bottom + 84, left: 0, right: 0, alignItems: 'center', opacity: show,
        transform: [{ translateY: show.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      {offline && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999,
          backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.borderStrong }}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
          <Text variant="caption" style={{ fontWeight: '700' }}>Offline · showing what was saved</Text>
        </View>
      )}
    </Animated.View>
  );
}
