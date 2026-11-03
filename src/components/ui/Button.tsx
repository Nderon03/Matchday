import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({ title, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, fullWidth, style, onPress, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const bg: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.elevated,
    ghost: 'transparent',
    danger: colors.dangerMuted,
    outline: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: colors.onPrimary,
    secondary: colors.text,
    ghost: colors.primary,
    danger: colors.danger,
    outline: colors.text,
  };
  const height = size === 'sm' ? 36 : size === 'lg' ? 54 : 46;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(e) => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          backgroundColor: pressed && variant === 'primary' ? colors.primaryPressed : bg[variant],
          borderColor: variant === 'outline' ? colors.borderStrong : 'transparent',
          opacity: isDisabled ? 0.5 : pressed && variant !== 'primary' ? 0.75 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.row}>
          {!!icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg[variant]} />}
          <Text variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'} color={fg[variant]} numberOfLines={1}>
            {title}
          </Text>
          {!!iconRight && <Ionicons name={iconRight} size={18} color={fg[variant]} />}
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon, onPress, label, size = 40, tone = 'default', badge, disabled,
}: { icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; label: string; size?: number; tone?: 'default' | 'primary' | 'danger'; badge?: number; disabled?: boolean }) {
  const { colors } = useTheme();
  const color = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, { width: size, height: size, backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
      {!!badge && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.bg }]}>
          <Text variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 12 }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2 },
});
