import React, { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Header, Input, Screen, Segmented, Text } from '@/components/ui';
import { HELP } from '@/legal/help';
import { CONTACT_EMAIL } from '@/legal/content';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Help & FAQ: public (no sign-in) so it also works as a web page. */
export default function Help() {
  const { colors } = useTheme();
  const [section, setSection] = useState(HELP[0].id);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return HELP.find((s) => s.id === section)!.items;
    return HELP.flatMap((s) => s.items).filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(term));
  }, [q, section]);
  return (
    <Screen edges={['top', 'bottom']} maxWidth={720}>
      <Header title="Help & FAQ" subtitle="How MATCHDAY works" />
      <Input value={q} onChangeText={setQ} placeholder="Search, e.g. refund" icon="search" autoCorrect={false} />
      {!q && <Segmented value={section} onChange={setSection} options={HELP.map((s) => ({ value: s.id, label: s.title }))} />}
      <Card padded={false}>
        {items.map((item, i) => {
          const expanded = open === item.q || !!q;
          return (
            <Pressable key={item.q} onPress={() => setOpen(expanded && !q ? null : item.q)} accessibilityRole="button" accessibilityState={{ expanded }}
              style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: space.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>{item.q}</Text>
                {!q && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />}
              </View>
              {expanded && <Text tone="muted">{item.a}</Text>}
            </Pressable>
          );
        })}
        {!items.length && <Text tone="muted" style={{ padding: space.md }}>Nothing matches “{q}”.</Text>}
      </Card>
      <Text variant="small" tone="muted">
        Still stuck? Email <Text variant="small" tone="primary" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>{CONTACT_EMAIL}</Text> and we’ll help.
      </Text>
    </Screen>
  );
}
