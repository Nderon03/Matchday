import React from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState, Header, Screen, Text } from '@/components/ui';
import { ACCOUNT_DELETION, CONTACT_EMAIL, LEGAL_UPDATED, PRIVACY, TERMS, type LegalDoc } from '@/legal/content';
import { space } from '@/theme/tokens';

const DOCS: Record<string, LegalDoc> = { privacy: PRIVACY, terms: TERMS, 'delete-account': ACCOUNT_DELETION };

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = DOCS[doc ?? ''];
  if (!d) return <Screen><Header title="Not found" /><EmptyState icon="document-outline" title="Page not found" /></Screen>;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={720}>
      <Header title={d.title} subtitle={`MATCHDAY · last updated ${LEGAL_UPDATED}`} />
      <View style={{ gap: space.sm }}>
        {d.intro.map((p, i) => <Text key={i}>{p}</Text>)}
      </View>
      {d.sections.map((s) => (
        <View key={s.heading} style={{ gap: space.sm }}>
          <Text variant="h3" accessibilityRole="header">{s.heading}</Text>
          {s.body?.map((p, i) => <Text key={i} tone="muted">{p}</Text>)}
          {s.bullets?.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.sm, paddingRight: space.sm }}>
              <Text tone="muted">•</Text>
              <Text tone="muted" style={{ flex: 1 }}>{b}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text variant="small" tone="primary" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} style={{ paddingVertical: space.lg }}>
        Questions? {CONTACT_EMAIL}
      </Text>
    </Screen>
  );
}
