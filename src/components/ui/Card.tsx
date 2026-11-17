import React from 'react';
import { Platform, Pressable, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  /** highlight / warning / danger: a soft tinted edge and wash, for the one thing on a screen that needs attention */
  variant?: 'default' | 'alt' | 'highlight' | 'warning' | 'danger';
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

export function Card({ onPress, padded = true, variant = 'default', style, children, accessibilityLabel, ...rest }: CardProps) {
  const { colors } = useTheme();
  const tone = variant === 'highlight' ? { bg: colors.primarySurface, edge: colors.primaryBorder }
    : variant === 'warning' ? { bg: colors.warningSurface, edge: colors.warningBorder }
    : variant === 'danger' ? { bg: colors.dangerSurface, edge: colors.dangerBorder }
    : null;
  const base: ViewStyle = {
    backgroundColor: tone?.bg ?? (variant === 'alt' ? colors.surfaceAlt : colors.surface),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tone?.edge ?? colors.border,
    // lit from above: a slightly brighter top edge gives depth without making anything bigger
    borderTopColor: tone?.edge ?? colors.borderTop,
    padding: padded ? space.lg : 0,
    overflow: 'hidden',
  };
  if (onPress) {
    return (
      <Pressable
        // On web a role of "button" renders a <button>, and cards often contain their own buttons
        // (a button inside a button is invalid HTML). Cards stay clickable and focusable either way.
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [base, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }, style as ViewStyle]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style as ViewStyle]} {...rest}>
      {children}
    </View>
  );
}
