import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { type as typeScale, type TypeVariant } from '@/theme/tokens';

type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'danger' | 'warning' | 'onPrimary' | 'gold';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  color?: string;
}

export function Text({ variant = 'body', tone = 'default', align, color, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const toneColor: Record<Tone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    primary: colors.primary,
    danger: colors.danger,
    warning: colors.warning,
    onPrimary: colors.onPrimary,
    gold: colors.gold,
  };
  return (
    <RNText
      maxFontSizeMultiplier={1.35}
      style={[typeScale[variant] as TextStyle, { color: color ?? toneColor[tone], textAlign: align }, style]}
      {...rest}
    />
  );
}
