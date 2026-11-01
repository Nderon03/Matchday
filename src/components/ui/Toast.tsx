import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { errorMessage } from '@/lib/errors';
import { Text } from './Text';

type Kind = 'success' | 'error' | 'info';
interface ToastCtx {
  show: (message: string, kind?: Kind) => void;
  error: (e: unknown) => void;
  success: (message: string) => void;
}
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; kind: Kind } | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, kind: Kind = 'info') => {
    setToast({ message, kind });
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => setToast(null));
    }, kind === 'error' ? 4500 : 2800);
  }, [opacity]);

  const value = { show, error: (e: unknown) => show(errorMessage(e), 'error'), success: (m: string) => show(m, 'success') };
  const icon = toast?.kind === 'success' ? 'checkmark-circle' : toast?.kind === 'error' ? 'alert-circle' : 'information-circle';
  const tint = toast?.kind === 'success' ? colors.success : toast?.kind === 'error' ? colors.danger : colors.text;

  return (
    <Ctx.Provider value={value}>
      {children}
      {!!toast && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, bottom: insets.bottom + 90 }]}>
          <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.toast, { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}>
            <Ionicons name={icon} size={20} color={tint} />
            <Text variant="smallStrong" style={{ flexShrink: 1 }}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1, maxWidth: 480 },
});
