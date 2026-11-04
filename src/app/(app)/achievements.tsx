import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, ErrorState, Header, Row, Screen, SectionTitle, SkeletonList, Text } from '@/components/ui';
import { AchievementBadge } from '@/components/football/AchievementBadge';
import { StreakCard } from '@/components/football/Streak';
import { CATEGORIES, TIERS, rarityLabel } from '@/domain/achievements';
import { formatDate } from '@/domain/format';
import { useMyAchievements, type MyAchievement } from '@/hooks/queries';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

export default function Achievements() {
  const mine = useMyAchievements();
  const d = mine.data;
  const unlocked = d?.items.filter((i) => i.unlocked_at).length ?? 0;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={720} onRefresh={mine.refetch} refreshing={mine.isRefetching}>
      <Header title="Achievements" subtitle={d ? `${unlocked} of ${d.items.length} unlocked` : undefined} />
      {!!mine.isLoading && <SkeletonList />}
      {!!mine.error && !d && <ErrorState error={mine.error} onRetry={mine.refetch} />}
      {!!d && (
        <>
          <StreakCard current={d.streak.current} best={d.streak.best} />
          <OverallBar value={unlocked / Math.max(1, d.items.length)} />
          {CATEGORIES.map((cat) => {
            const items = d.items.filter((i) => i.category === cat);
            if (!items.length) return null;
            return (
              <View key={cat} style={{ gap: space.sm }}>
                <SectionTitle title={`${cat} · ${items.filter((i) => i.unlocked_at).length}/${items.length}`} />
                <Card padded={false}>
                  {items.map((a, i) => <AchievementRow key={a.code} a={a} players={d.players} first={i === 0} index={i} />)}
                </Card>
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}

function AchievementRow({ a, players, first, index }: { a: MyAchievement; players: number; first: boolean; index: number }) {
  const { colors, reduceMotion } = useTheme();
  const on = !!a.unlocked_at;
  const tier = TIERS[a.tier];
  const rarity = rarityLabel(a.holders, players);
  const [enter] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(enter, { toValue: 1, duration: 320, delay: 40 * index, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [enter, index, reduceMotion]);
  const body = (
    <Row gap={space.md} style={{ padding: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <AchievementBadge icon={a.icon} tier={a.tier} unlocked={on} progress={a.progress} target={a.target} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <Text variant="bodyStrong" tone={on ? 'default' : 'muted'} style={{ flexShrink: 1 }} numberOfLines={1}>{a.name}</Text>
          <Text variant="caption" style={{ color: tier.colour }}>{tier.label}</Text>
        </Row>
        <Text variant="small" tone="muted">{a.description}</Text>
        <Text variant="caption" tone="faint">
          {on ? `Unlocked ${formatDate(a.unlocked_at!)}` : a.target > 1 ? `${a.progress} / ${a.target}` : 'Not yet'}
          {rarity ? ` · ${rarity}` : ''}
        </Text>
      </View>
      {on && <Ionicons name="share-outline" size={18} color={colors.textFaint} />}
    </Row>
  );
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}
      accessible accessibilityLabel={`${a.name}, ${tier.label}, ${on ? 'unlocked' : `${a.progress} of ${a.target}`}`}>
      {on
        ? <Pressable onPress={() => shareText(`I unlocked “${a.name}” on MATCHDAY 🏆`).catch(() => undefined)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{body}</Pressable>
        : body}
    </Animated.View>
  );
}

function OverallBar({ value }: { value: number }) {
  const { colors, reduceMotion } = useTheme();
  const [w] = useState(() => new Animated.Value(reduceMotion ? value : 0));
  useEffect(() => {
    if (reduceMotion) { w.setValue(value); return; }
    Animated.timing(w, { toValue: value, duration: 800, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [w, value, reduceMotion]);
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}
