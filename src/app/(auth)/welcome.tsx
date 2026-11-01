import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Button, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const FEATURES: [keyof typeof Ionicons.glyphMap, string, string][] = [
  ['calendar', 'Organise in seconds', 'Repeat last week’s game, invite the squad, collect fees.'],
  ['shuffle', 'Balanced teams', 'Line-ups suggested from real performance history.'],
  ['star', 'Vote & rate', 'Anonymous MOTM votes and player ratings after every game.'],
  ['podium', 'Compete', 'Career stats, leaderboards, seasons and awards.'],
];

export default function Welcome() {
  const { colors } = useTheme();
  return (
    <Screen edges={['top', 'bottom']} maxWidth={520}>
      <View style={{ alignItems: 'center', paddingTop: space.xxxl, gap: space.lg }}>
        <Svg width={88} height={88} viewBox="0 0 88 88" accessibilityLabel="MATCHDAY logo">
          <Rect x={4} y={4} width={80} height={80} rx={22} fill={colors.primaryMuted} stroke={colors.primary} strokeWidth={2} />
          <Line x1={44} y1={14} x2={44} y2={74} stroke={colors.primary} strokeWidth={2} />
          <Circle cx={44} cy={44} r={13} stroke={colors.primary} strokeWidth={2} fill="none" />
          <Circle cx={44} cy={44} r={3} fill={colors.primary} />
        </Svg>
        <View style={{ alignItems: 'center', gap: space.xs }}>
          <Text variant="display" accessibilityRole="header">MATCHDAY</Text>
          <Text tone="muted" align="center">Your football. Your squad. Your statistics.</Text>
        </View>
      </View>
      <View style={{ gap: space.md, marginTop: space.xl }}>
        {FEATURES.map(([icon, title, body]) => (
          <View key={title} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{title}</Text>
              <Text variant="small" tone="muted">{body}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button title="Create account" size="lg" onPress={() => router.push('/sign-up')} />
        <Button title="I already have an account" variant="secondary" size="lg" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
