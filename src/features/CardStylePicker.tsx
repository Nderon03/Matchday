import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Row, Text, useToast } from '@/components/ui';
import { CardFX } from '@/components/football/CardFX';
import { CARD_STYLES, type CardStyle } from '@/domain/achievements';
import { plural } from '@/domain/format';
import { keys, useMyAchievements } from '@/hooks/queries';
import { rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

function Tile({ s, selected, unlocked, points, onPress }: { s: CardStyle; selected: boolean; unlocked: boolean; points: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected, disabled: !unlocked }}
      accessibilityLabel={`${s.name} card${unlocked ? '' : `, needs ${plural(s.points, 'medal point')}`}`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: s.base ? 92 : 124, height: s.base ? 64 : 80, borderRadius: radius.md, overflow: 'hidden',
        borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : s.border ?? colors.border, opacity: unlocked ? 1 : 0.5 }}>
        <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
          <Defs>
            <LinearGradient id={`cs-${s.id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={s.from} />
              <Stop offset="1" stopColor={s.to} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#cs-${s.id})`} />
        </Svg>
        {unlocked && <CardFX st={s} radius={radius.md} />}
        <View style={{ flex: 1, padding: space.sm, justifyContent: 'space-between' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.accent }} />
            {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} /> : !unlocked ? <Ionicons name="lock-closed" size={13} color={s.muted} /> : null}
          </Row>
          <View>
            <Text variant="caption" color={s.accent} style={{ fontWeight: '700' }} numberOfLines={1}>{s.name}</Text>
            {!s.base && <Text variant="caption" color={s.muted} style={{ fontSize: 10 }} numberOfLines={1}>{unlocked ? (selected ? 'In use' : 'Unlocked') : `${s.points - points} more points`}</Text>}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Choose how your player card looks: a free base colour, or an earned style (Bronze → Hall of
 * Fame) unlocked with medal points, which come with a shimmer, glowing edge and sparkles.
 */
export function CardStylePicker() {
  const mine = useMyAchievements();
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const points = mine.data?.points ?? 0;
  const current = picked ?? mine.data?.card_style ?? 'classic';

  const choose = async (s: CardStyle) => {
    if (points < s.points) return toast.show(`Earn ${plural(s.points - points, 'more medal point')} to unlock ${s.name}.`);
    if (s.id === current) return;
    const before = current;
    setPicked(s.id);
    haptics.tap();
    try {
      await rpc('set_card_style', { p_style: s.id });
      qc.invalidateQueries({ queryKey: keys.myAchievements });
      qc.invalidateQueries({ queryKey: ['player'] });
    } catch (e) {
      setPicked(before);
      toast.error(e);
    }
  };

  const row = (list: CardStyle[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
      {list.map((s) => <Tile key={s.id} s={s} points={points} selected={current === s.id} unlocked={points >= s.points} onPress={() => choose(s)} />)}
    </ScrollView>
  );
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" tone="muted">Colours</Text>
      {row(CARD_STYLES.filter((s) => s.base))}
      <Text variant="caption" tone="muted">Earned with medals · you have {plural(points, 'point')}</Text>
      {row(CARD_STYLES.filter((s) => !s.base))}
    </View>
  );
}
