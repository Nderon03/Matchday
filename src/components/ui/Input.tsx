import React, { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
  right?: React.ReactNode;
}

export const Input = forwardRef<TextInputInstance, InputProps>(function Input({ label, error, hint, icon, secure, right, style, multiline, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={{ gap: space.xs }}>
      {label && <Text variant="smallStrong" tone="muted">{label}</Text>}
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
            minHeight: multiline ? 96 : 48,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {icon && <Ionicons name={icon} size={18} color={colors.textFaint} style={{ marginTop: multiline ? 14 : 0 }} />}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={hidden}
          multiline={multiline}
          accessibilityLabel={label ?? rest.placeholder}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          style={[styles.input, { color: colors.text, fontFamily: fonts.regular, paddingTop: multiline ? 12 : 0, textAlignVertical: multiline ? 'top' : 'center' }, Platform.OS === 'web' && webNoOutline, style]}
          {...rest}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} accessibilityLabel={hidden ? 'Show password' : 'Hide password'} hitSlop={8}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        )}
        {right}
      </View>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : hint ? <Text variant="caption" tone="faint">{hint}</Text> : null}
    </View>
  );
});

// the browser's own focus ring sits inside the field and covers the text; the box border shows focus instead
const webNoOutline = { outlineStyle: 'none', outlineWidth: 0 } as object;

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md },
  input: { flex: 1, fontSize: 15, minHeight: 46 },
});
