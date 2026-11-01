import React from 'react';
import { Pressable, View, type ViewProps, type ViewStyle } from 'react-native';
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
        accessibilityRole="button"
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
