import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

const TINTS = ['#22C55E', '#38BDF8', '#F5A524', '#A78BFA', '#F472B6', '#2DD4BF', '#FB923C'];

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ uri, name, size = 40, ring }: { uri?: string | null; name?: string | null; size?: number; ring?: string }) {
  const { colors } = useTheme();
  const tint = TINTS[(name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
      style={{
        width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
        backgroundColor: uri ? colors.surfaceAlt : `${tint}26`, borderWidth: ring ? 2 : 0, borderColor: ring,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      ) : (
        <Text variant="bodyStrong" color={tint} style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}>{initials(name)}</Text>
      )}
    </View>
  );
}
