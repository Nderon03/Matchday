import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import type { LeaderboardRow } from '@/types/db';

/** Premium top-three podium: gold centre, silver left, bronze right. */
export function Podium({ rows, format, onPress }: { rows: LeaderboardRow[]; format: (v: number) => string; onPress?: (r: LeaderboardRow) => void }) {
  const { colors } = useTheme();
  const slots = [rows[1], rows[0], rows[2]];
  const medal = [colors.silver, colors.gold, colors.bronze];
  const heights = [96, 128, 80];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingTop: space.lg }} accessibilityRole="summary">
      {slots.map((r, i) => (
        <Pressable
          key={i}
          disabled={!r}
          onPress={() => r && onPress?.(r)}
          accessibilityLabel={r ? `${r.rank === 1 ? 'First' : r.rank === 2 ? 'Second' : 'Third'}: ${r.display_name}, ${format(r.value)}` : 'Empty'}
          style={{ flex: 1, alignItems: 'center', gap: space.sm }}
        >
          {r ? (
            <>
              {i === 1 && <Ionicons name="trophy" size={22} color={colors.gold} />}
              <Avatar uri={r.avatar_url} name={r.display_name} size={i === 1 ? 72 : 56} ring={medal[i]} />
              <View style={{ alignItems: 'center' }}>
                <Text variant="smallStrong" numberOfLines={1}>{r.display_name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>@{r.username}</Text>
              </View>
            </>
          ) : (
            <View style={{ height: 80 }} />
          )}
          <View style={{ width: '100%', height: heights[i], borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, backgroundColor: `${medal[i]}22`, borderTopWidth: 3, borderColor: medal[i], alignItems: 'center', paddingTop: space.sm, gap: 2 }}>
            <Text variant="h2" color={medal[i]}>{r ? r.rank : i === 1 ? 1 : i === 0 ? 2 : 3}</Text>
            {!!r && <Text variant="statSmall">{format(r.value)}</Text>}
            {!!r && <Text variant="caption" tone="faint">{r.appearances} apps</Text>}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
