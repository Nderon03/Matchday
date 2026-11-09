import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, Sheet, Text } from '@/components/ui';
import { ClubShield, Flag } from '@/components/football/Identity';
import { COUNTRIES, COUNTRY_BY_CODE } from '@/data/countries';
import { CLUB_BY_ID, searchClubs } from '@/data/clubs';
import { CONTACT_EMAIL } from '@/legal/content';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Row({ selected, onPress, left, title, subtitle }: { selected: boolean; onPress: () => void; left: React.ReactNode; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 32, alignItems: 'center' }}>{left}</View>
      <View style={{ flex: 1 }}>
        <Text variant={selected ? 'bodyStrong' : 'body'}>{title}</Text>
        {!!subtitle && <Text variant="caption" tone="muted">{subtitle}</Text>}
      </View>
      {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
    </Pressable>
  );
}

export function CountryPicker({ visible, value, onClose, onPick }: { visible: boolean; value: string | null; onClose: () => void; onPick: (code: string | null) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const p = plain(q.trim());
    return p ? COUNTRIES.filter((c) => plain(c.name).split(/[\s-]+/).some((w) => w.startsWith(p)) || plain(c.name).startsWith(p)) : COUNTRIES;
  }, [q]);
  return (
    <Sheet scroll={false} visible={visible} onClose={onClose} title="Nationality">
      <Input value={q} onChangeText={setQ} placeholder="Search countries" icon="search" autoCorrect={false} />
      <FlatList
        style={{ maxHeight: 420, flexShrink: 1 }}
        data={list}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        ListHeaderComponent={value ? <Row selected={false} onPress={() => onPick(null)} left={<Ionicons name="close-circle-outline" size={22} color="#8A94A3" />} title="Don’t show a nationality" /> : undefined}
        renderItem={({ item }) => <Row selected={item.code === value} onPress={() => onPick(item.code)} left={<Flag code={item.code} height={18} />} title={item.name} />}
        ListEmptyComponent={<Text tone="muted" style={{ paddingVertical: space.md }}>No country matches “{q}”.</Text>}
      />
    </Sheet>
  );
}

export function ClubPicker({ visible, value, onClose, onPick }: { visible: boolean; value: string | null; onClose: () => void; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchClubs(q, 300), [q]);
  return (
    <Sheet scroll={false} visible={visible} onClose={onClose} title="Club you support">
      <Input value={q} onChangeText={setQ} placeholder="Search clubs, e.g. Arsenal" icon="search" autoCorrect={false} />
      <FlatList
        style={{ maxHeight: 420, flexShrink: 1 }}
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        ListHeaderComponent={value ? <Row selected={false} onPress={() => onPick(null)} left={<Ionicons name="close-circle-outline" size={22} color="#8A94A3" />} title="Don’t show a club" /> : undefined}
        renderItem={({ item }) => (
          <Row selected={item.id === value} onPress={() => onPick(item.id)} left={<ClubShield club={item} size={28} />} title={item.name}
            subtitle={COUNTRY_BY_CODE[item.country]?.name} />
        )}
        ListEmptyComponent={<Text tone="muted" style={{ paddingVertical: space.md }}>No club matches “{q}”. Missing a real club? Email {CONTACT_EMAIL} and we’ll add it.</Text>}
      />
    </Sheet>
  );
}

export const clubName = (id: string | null | undefined) => (id ? CLUB_BY_ID[id]?.name ?? null : null);
export const countryName = (code: string | null | undefined) => (code ? COUNTRY_BY_CODE[code]?.name ?? null : null);
