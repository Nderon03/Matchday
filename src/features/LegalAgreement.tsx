import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { rpc } from '@/lib/api';
import { LEGAL_VERSION } from '@/legal/content';

/** "I agree to the Terms of Use and Privacy Policy" with links to both. */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel="I agree to the Terms of Use and Privacy Policy" hitSlop={8}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.primary : colors.textMuted} />
      </Pressable>
      <Text variant="small" style={{ flex: 1 }} onPress={() => onChange(!checked)}>
        I’m 16 or over and agree to the{' '}
        <Text variant="smallStrong" tone="primary" onPress={() => router.push('/legal/terms')}>Terms of Use</Text>
        {' '}and{' '}
        <Text variant="smallStrong" tone="primary" onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>.
      </Text>
    </View>
  );
}

/** Shown to signed-in players when the terms have changed since they last accepted them. */
export function TermsUpdatePrompt() {
  const { profile, refreshProfile } = useAuth();
  const pathname = usePathname();
  const toast = useToast();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const needed = !!profile?.onboarded && profile.terms_version !== LEGAL_VERSION;
  // step aside while they read the documents
  if (!needed || pathname.startsWith('/legal')) return null;
  return (
    <Sheet visible onClose={() => undefined} title="Our terms have been updated">
      <Text tone="muted">Please read and accept the latest Terms of Use and Privacy Policy to keep using MATCHDAY.</Text>
      <TermsCheckbox checked={checked} onChange={setChecked} />
      <Button title="Continue" disabled={!checked} loading={busy} onPress={async () => {
        setBusy(true);
        try {
          await rpc('accept_terms', { p_version: LEGAL_VERSION });
          await refreshProfile();
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }} />
    </Sheet>
  );
}
