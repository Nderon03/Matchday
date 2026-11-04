import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { Confetti } from '@/components/football/Confetti';
import { highlightText, matchHighlights, type Highlight, type MatchReveal } from '@/domain/matchReveal';
import { formatKickoff } from '@/domain/format';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

const ICON: Record<Highlight['kind'], keyof typeof Ionicons.glyphMap> = {
  motm: 'star', goals_pb: 'football', assists_pb: 'git-merge', rating_pb: 'trending-up',
};

/**
 * "Your match": shown once after a game is finalised. A calm summary for an ordinary game;
 * Man of the Match or a new personal best gets a highlight and a little confetti.
 */
export function MatchRevealCard({ r, onDone }: { r: MatchReveal; onDone: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const highlights = matchHighlights(r);
  const special = highlights.length > 0;
  const rating = r.rating_eligible && r.rating_avg !== null ? Number(r.rating_avg) : null;
  const [card] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [stats] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [hl] = useState(() => highlights.map(() => new Animated.Value(reduceMotion ? 1 : 0)));
  const [shown, setShown] = useState(reduceMotion ? rating ?? 0 : 0);

  useEffect(() => {
    if (special) haptics.success();
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(card, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.timing(stats, { toValue: 1, duration: 360, easing: Easing.out(Easing.back(1.6)), useNativeDriver: native }),
      Animated.stagger(140, hl.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 80, useNativeDriver: native }))),
    ]).start();
    if (rating === null) return;
    // rating counts up alongside the card
    let raf = 0;
    const start = Date.now() + 260;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / 1000));
      setShown(rating * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = [
    r.wins ? { label: `${r.wins}W`, colour: colors.success } : null,
    r.draws ? { label: `${r.draws}D`, colour: colors.textMuted } : null,
    r.losses ? { label: `${r.losses}L`, colour: colors.danger } : null,
  ].filter(Boolean) as { label: string; colour: string }[];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onDone} accessibilityLabel="Close" />
      {special && !reduceMotion && <Confetti colour={highlights[0].kind === 'motm' ? '#F5B014' : '#22C55E'} />}
      <View style={styles.centre} pointerEvents="box-none">
        <Animated.View accessibilityViewIsModal style={[styles.card, {
          backgroundColor: colors.surface, borderColor: special ? `${colors.gold}66` : colors.border,
          opacity: card, transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }]}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="overline" tone="primary">Your match</Text>
            <Text variant="h2" align="center" accessibilityRole="header" numberOfLines={2}>{r.name}</Text>
            <Text variant="caption" tone="muted" align="center">{[r.group_name !== r.name ? r.group_name : null, formatKickoff(r.played_at)].filter(Boolean).join(' · ')}</Text>
          </View>

          <Animated.View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
            opacity: stats, transform: [{ scale: stats.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 44, lineHeight: 50, fontWeight: '800', color: rating === null ? colors.textFaint : colors.text }}>
                {rating === null ? '–' : shown.toFixed(1)}
              </Text>
              <Text variant="caption" tone="muted">{rating === null ? 'Not enough ratings' : 'Your rating'}</Text>
            </View>
            <View style={{ gap: space.xs }}>
              {result.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {result.map((x) => (
                    <View key={x.label} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: `${x.colour}22` }}>
                      <Text variant="smallStrong" style={{ color: x.colour }}>{x.label}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text variant="small" tone="muted">
                {r.goals} {r.goals === 1 ? 'goal' : 'goals'} · {r.assists} {r.assists === 1 ? 'assist' : 'assists'}
              </Text>
            </View>
          </Animated.View>

          {highlights.length > 0 && (
            <View style={{ alignSelf: 'stretch', gap: space.sm }}>
              {highlights.map((h, i) => {
                const t = highlightText(h);
                const gold = h.kind === 'motm';
                return (
                  <Animated.View key={h.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md,
                    backgroundColor: gold ? `${colors.gold}1A` : colors.primaryMuted,
                    opacity: hl[i], transform: [{ scale: hl[i].interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
                    <Ionicons name={ICON[h.kind]} size={22} color={gold ? colors.gold : colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{t.title}</Text>
                      <Text variant="caption" tone="muted">{t.detail}</Text>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
            <Button title="Match report" variant="secondary" style={{ flex: 1 }} onPress={() => { onDone(); router.push(`/session/${r.session_id}`); }} />
            <Button title="Done" style={{ flex: 1 }} onPress={onDone} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 400, borderRadius: radius.xl, borderWidth: 1, padding: space.xl, gap: space.lg, alignItems: 'center' },
});
