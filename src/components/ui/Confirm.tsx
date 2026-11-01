import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { Button } from './Button';
import { Input } from './Input';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Ask for an optional free-text reason (returned instead of `true`). */
  reasonLabel?: string;
  /** Show a checkbox (e.g. "Also remove their guests"); its value is returned as `checked`. */
  checkboxLabel?: string;
  checkboxDefault?: boolean;
}
type Result = false | true | { reason: string; checked: boolean };

const Ctx = createContext<((o: ConfirmOptions) => Promise<Result>) | null>(null);

/** In-app confirmation sheet (no browser pop-ups). `await confirm({...})` resolves true/false. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const { colors } = useTheme();
  const resolver = useRef<((r: Result) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setReason('');
    setChecked(!!o.checkboxDefault);
    setOpts(o);
    return new Promise<Result>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (r: Result) => {
    resolver.current?.(r);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Sheet visible={!!opts} onClose={() => close(false)} title={opts?.title ?? ''}>
        {!!(opts?.message) && <Text tone="muted">{opts.message}</Text>}
        {!!(opts?.reasonLabel) && <Input label={opts.reasonLabel} value={reason} onChangeText={setReason} maxLength={200} />}
        {!!(opts?.checkboxLabel) && (
          <Pressable onPress={() => setChecked((c) => !c)} accessibilityRole="checkbox" accessibilityState={{ checked }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs }}>
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.primary : colors.textMuted} />
            <Text style={{ flex: 1 }}>{opts.checkboxLabel}</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <Button title={opts?.cancelLabel ?? 'Cancel'} variant="secondary" style={{ flex: 1 }} onPress={() => close(false)} />
          <Button
            title={opts?.confirmLabel ?? 'Confirm'}
            variant={opts?.destructive ? 'danger' : 'primary'}
            style={{ flex: 1 }}
            onPress={() => close(opts?.reasonLabel || opts?.checkboxLabel ? { reason: reason.trim(), checked } : true)}
          />
        </View>
      </Sheet>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConfirm outside ConfirmProvider');
  return c;
}
