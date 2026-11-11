import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Text } from '@/components/ui';
import { AchievementBadge } from '@/components/football/AchievementBadge';
import { happyMoment } from '@/lib/review';
import { Confetti } from '@/components/football/Confetti';
import { CARD_STYLES, SEASON_CHAMPION, levelInfo, medalPoints, rarityLabel, type CardStyle } from '@/domain/achievements';
import { useMyAchievements, type MyAchievement } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { shareText } from '@/lib/share';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';
const seenKey = (uid: string) => `matchday.achievementsSeen.${uid}`;

/**
 * Celebrates achievements unlocked since the player last saw one: on opening the app after a
 * game, or straight away if it unlocks while they're using it. The first time this runs on a
 * device it only records "now", so existing players aren't shown a backlog.
 */
export function AchievementCelebration() {
  const { userId } = useAuth();
  const mine = useMyAchievements();
  const [seen, setSeen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(userId))
      .then((v) => {
        if (!alive) return;
        if (v) return setSeen(v);
        const now = new Date().toISOString();
        setSeen(now);
        AsyncStorage.setItem(seenKey(userId), now).catch(() => undefined);
      })
      .catch(() => alive && setSeen(new Date().toISOString()));
    return () => { alive = false; };
  }, [userId]);

  const fresh = useMemo(() => (seen && mine.data ? mine.data.items.filter((i) => i.unlocked_at && i.unlocked_at > seen) : []), [seen, mine.data]);
  // one celebration per medal: several levels at once show as the highest
  const queue = useMemo(() => {
    const best = new Map<string, MyAchievement>();
    for (const i of fresh) {
      if (dismissed.has(i.code)) continue;
      const cur = best.get(i.track);
      if (!cur || (i.level ?? 5) > (cur.level ?? 5)) best.set(i.track, i);
    }
    return [...best.values()].sort((a, b) => a.unlocked_at!.localeCompare(b.unlocked_at!) || (a.level ?? 5) - (b.level ?? 5));
  }, [fresh, dismissed]);
  // card styles that these unlocks pushed the player into
  const newStyles = useMemo(() => {
    if (!mine.data || !seen) return [];
    const before = medalPoints(mine.data.items.filter((i) => i.unlocked_at && i.unlocked_at <= seen).map((i) => i.code));
    return CARD_STYLES.filter((c) => c.points > before && c.points <= mine.data!.points);
  }, [mine.data, seen]);

  if (!userId || !queue.length || !mine.data) return null;
  const done = (item: MyAchievement) => {
    const next = new Set(dismissed);
    fresh.filter((i) => i.track === item.track).forEach((i) => next.add(i.code));
    setDismissed(next);
    if (fresh.every((i) => next.has(i.code))) {
      const latest = fresh.reduce((m, i) => (i.unlocked_at! > m ? i.unlocked_at! : m), seen!);
      setSeen(latest);
      setDismissed(new Set());
      AsyncStorage.setItem(seenKey(userId), latest).catch(() => undefined);
      happyMoment();
    }
  };
  const last = queue.length === 1;
  return <Celebration key={queue[0].code} item={queue[0]} more={queue.length - 1} players={mine.data.players} newStyle={last ? newStyles[newStyles.length - 1] ?? null : null} onDone={done} />;
}

function Celebration({ item, more, players, newStyle, onDone }: { item: MyAchievement; more: number; players: number; newStyle: CardStyle | null; onDone: (i: MyAchievement) => void }) {
  const { colors, reduceMotion } = useTheme();
  const isChampion = item.code === SEASON_CHAMPION.code;
  const level = isChampion ? 5 : item.level ?? 1;
  const tier = levelInfo(level);
  const rarity = rarityLabel(item.holders, players);
  const [card] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [badge] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [text] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    haptics.unlock();
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(card, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.parallel([
        Animated.spring(badge, { toValue: 1, friction: 5, tension: 70, useNativeDriver: native }),
        Animated.timing(text, { toValue: 1, duration: 400, delay: 180, useNativeDriver: native }),
      ]),
    ]).start();
  }, [card, badge, text, reduceMotion]);

  const done = () => onDone(item);
  const headline = isChampion ? 'Player of the Season' : level > 1 ? `Level up · ${tier.label}` : `New medal · ${tier.label}`;
  const shareLine = isChampion ? 'I was named Player of the Season on MATCHDAY 🏆' : `I reached ${tier.label} in ${item.name} on MATCHDAY 🏅`;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={done} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={done} accessibilityLabel="Close" />
      {!reduceMotion && <Confetti colour={tier.colour} />}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.centre, { flex: undefined, flexGrow: 1 }]} bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View accessibilityViewIsModal style={[styles.card, {
          backgroundColor: colors.surface, borderColor: `${tier.colour}66`,
          opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }]}>
          <View style={{ alignItems: 'center', justifyContent: 'center', height: 132 }}>
            <View style={{ position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: `${tier.colour}1F` }} />
            <Animated.View style={{ transform: [
              { scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { rotate: badge.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) },
            ], opacity: badge.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }) }}>
              <AchievementBadge icon={item.icon} level={level} size={104} />
            </Animated.View>
          </View>
          <Animated.View style={{ alignItems: 'center', gap: space.xs, opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
            <Text variant="overline" style={{ color: tier.colour }}>{headline}</Text>
            <Text variant="h2" align="center" accessibilityRole="header">{item.name}</Text>
            <Text tone="muted" align="center">{item.description}</Text>
            {!!rarity && <Text variant="caption" tone="faint" align="center">{rarity} have this</Text>}
          </Animated.View>
          {!!newStyle && (
            <Pressable onPress={() => { done(); router.push('/achievements'); }} accessibilityRole="button"
              style={{ alignSelf: 'stretch', borderRadius: radius.md, borderWidth: 1, borderColor: newStyle.border ?? colors.border, backgroundColor: newStyle.to, padding: space.md }}>
              <Text variant="smallStrong" color={newStyle.accent} align="center">New player card unlocked: {newStyle.name}</Text>
              <Text variant="caption" color={newStyle.muted} align="center">Tap to try it on</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.sm }}>
            <Button title="Share" variant="secondary" icon="share-outline" style={{ flex: 1 }}
              onPress={() => shareText(shareLine).catch(() => undefined)} />
            <Button title={more ? `Next (${more} more)` : 'Nice'} style={{ flex: 1 }} onPress={done} />
          </View>
          <Text variant="small" tone="primary" onPress={() => { done(); router.push('/achievements'); }}>See all achievements</Text>
        </Animated.View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 380, borderRadius: radius.xl, borderWidth: 1, padding: space.xl, gap: space.md, alignItems: 'center' },
});
