import React from 'react';
import { Platform, Pressable, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  variant?: 'default' | 'alt' | 'highlight';
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

export function Card({ onPress, padded = true, variant = 'default', style, children, accessibilityLabel, ...rest }: CardProps) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: variant === 'alt' ? colors.surfaceAlt : colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: variant === 'highlight' ? colors.primary : colors.border,
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
        style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style as ViewStyle]}
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
