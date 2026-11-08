import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { errorMessage, toAppError } from '@/lib/errors';
import { Text } from './Text';
import { Button } from './Button';

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: space.xxxl, alignItems: 'center', gap: space.md }} accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator color={colors.primary} />
      {!!label && <Text tone="muted" variant="small">{label}</Text>}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style, rounded }: { height?: number; width?: ViewStyle['width']; style?: ViewStyle; rounded?: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return <Animated.View style={[{ height, width, borderRadius: rounded ? height / 2 : radius.sm, backgroundColor: colors.elevated, opacity }, style]} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: space.md }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <Skeleton height={40} width={40} rounded />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width="35%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A little pitch with the screen's icon on the centre spot, gently bobbing: empty screens with character. */
function PitchArt({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  const { colors, reduceMotion } = useTheme();
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(bob, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bob, reduceMotion]);
  const line = colors.primary;
  return (
    <View style={{ width: 150, height: 92, marginBottom: space.sm, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={150} height={92} style={{ position: 'absolute' }}>
        <Rect x={1} y={1} width={148} height={90} rx={12} fill={colors.primaryMuted} stroke={line} strokeOpacity={0.35} strokeWidth={1.5} />
        <Line x1={75} y1={1} x2={75} y2={91} stroke={line} strokeOpacity={0.35} strokeWidth={1.5} />
        <Circle cx={75} cy={46} r={22} stroke={line} strokeOpacity={0.35} strokeWidth={1.5} fill="none" />
        <Rect x={1} y={28} width={16} height={36} stroke={line} strokeOpacity={0.35} strokeWidth={1.5} fill="none" />
        <Rect x={133} y={28} width={16} height={36} stroke={line} strokeOpacity={0.35} strokeWidth={1.5} fill="none" />
      </Svg>
      <Animated.View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: line,
        alignItems: 'center', justifyContent: 'center', transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>
        <Ionicons name={icon} size={18} color={line} />
      </Animated.View>
    </View>
  );
}

export function EmptyState({ icon = 'football-outline', title, message, action }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <PitchArt icon={icon} />
      <Text variant="h3" align="center">{title}</Text>
      {!!message && <Text tone="muted" align="center" style={{ maxWidth: 320 }}>{message}</Text>}
      {!!action && <Button title={action.label} onPress={action.onPress} style={{ marginTop: space.md }} />}
    </View>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const e = toAppError(error);
  const icon = e.code === 'network' ? 'cloud-offline-outline' : e.code === 'forbidden' ? 'lock-closed-outline' : 'alert-circle-outline';
  return (
    <View style={{ alignItems: 'center', padding: compact ? space.lg : space.xxl, gap: space.sm }} accessibilityRole="alert">
      <Ionicons name={icon} size={compact ? 22 : 32} color={colors.danger} />
      <Text variant={compact ? 'smallStrong' : 'h3'} align="center">{e.code === 'network' ? 'You’re offline' : 'Couldn’t load this'}</Text>
      <Text tone="muted" variant="small" align="center" style={{ maxWidth: 320 }}>{errorMessage(error)}</Text>
      {!!onRetry && <Button title="Try again" variant="secondary" size="sm" icon="refresh" onPress={onRetry} style={{ marginTop: space.sm }} />}
    </View>
  );
}

/** Renders loading / error / content consistently for a react-query result. */
export function QueryView<T>({ query, children, skeleton }: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => React.ReactNode;
  skeleton?: React.ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <Loading />}</>;
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return <Loading />;
  return <>{children(query.data)}</>;
}
