import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Avatar, Input, Text } from '@/components/ui';
import type { PublicProfile } from '@/hooks/queries';

/** Multi-select list of people with search; used for invites. */
export function PeoplePicker({ people, selected, onToggle, disabledIds, emptyText = 'No one to invite yet — add friends first.' }: {
  people: PublicProfile[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabledIds?: Set<string>;
  emptyText?: string;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.username.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q)) : people;
  }, [people, query]);
  if (!people.length) return <Text tone="muted" variant="small">{emptyText}</Text>;
  return (
    <View style={{ gap: space.sm }}>
      {people.length > 8 && <Input placeholder="Search" value={query} onChangeText={setQuery} icon="search" />}
      <View style={{ gap: 2 }}>
        {filtered.map((p) => {
          const on = selected.has(p.id);
          const disabled = disabledIds?.has(p.id);
          return (
            <Pressable key={p.id} disabled={disabled} onPress={() => onToggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, backgroundColor: on ? colors.primaryMuted : pressed ? colors.surfaceAlt : 'transparent', opacity: disabled ? 0.5 : 1 })}>
              <Avatar uri={p.avatar_url} name={p.display_name} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{p.display_name}</Text>
                <Text variant="caption" tone="muted">@{p.username}{disabled ? ' · already invited' : ''}</Text>
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.primary : colors.textFaint} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
