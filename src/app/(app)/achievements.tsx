import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Button, Card, ErrorState, Header, Row, Screen, SectionTitle, Sheet, SkeletonList, Text, useToast } from '@/components/ui';
import { AchievementBadge } from '@/components/football/AchievementBadge';
import { StreakCard } from '@/components/football/Streak';
import { CARD_STYLES, LEVELS, MAX_POINTS, SEASON_CHAMPION, TRACKS, levelInfo, rarityLabel, type CardStyle, type TrackDef } from '@/domain/achievements';
import { formatDate, plural } from '@/domain/format';
import { keys, useMyAchievements, type MyAchievement, type MyAchievements } from '@/hooks/queries';
import { useLayout } from '@/hooks/useLayout';
import { rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

interface TrackState { def: TrackDef; level: number; value: number; next: number | null; prev: number; items: MyAchievement[] }

function tracksFrom(d: MyAchievements): TrackState[] {
  return TRACKS.map((def) => {
    const items = d.items.filter((i) => i.track === def.track).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    const level = items.filter((i) => i.unlocked_at).reduce((m, i) => Math.max(m, i.level ?? 0), 0);
    const value = items[0]?.value ?? 0;
    return { def, level, value, next: level < 5 ? def.targets[level] : null, prev: level ? def.targets[level - 1] : 0, items };
  });
}

export default function Achievements() {
  const mine = useMyAchievements();
  const { isWide } = useLayout();
  const [open, setOpen] = useState<TrackState | null>(null);
  const d = mine.data;
  const tracks = d ? tracksFrom(d) : [];
  const champion = d?.items.find((i) => i.code === SEASON_CHAMPION.code);
  const cardWidth = isWide ? '31.8%' : '48.4%';
  return (
    <Screen edges={['top', 'bottom']} maxWidth={760} onRefresh={mine.refetch} refreshing={mine.isRefetching}>
      <Header title="Achievements" subtitle={d ? `${d.points} of ${MAX_POINTS} medal points` : undefined} />
      {!!mine.isLoading && <SkeletonList />}
      {!!mine.error && !d && <ErrorState error={mine.error} onRetry={mine.refetch} />}
      {!!d && (
        <>
          <StreakCard current={d.streak.current} best={d.streak.best} />

          <SectionTitle title="Medals" />
          <Text variant="small" tone="muted" style={{ marginTop: -space.sm }}>
            Each medal levels up: {LEVELS.map((l) => l.label).join(' → ')}. Tap one to see every level.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'space-between' }}>
            {tracks.map((t, i) => <TrackTile key={t.def.track} t={t} index={i} width={cardWidth} onPress={() => setOpen(t)} />)}
            {!!champion && (
              <Card style={{ width: cardWidth as any, opacity: champion.unlocked_at ? 1 : 0.85 }} accessibilityLabel={`Season Champion${champion.value ? `, won ${plural(champion.value, 'time')}` : ', not yet won'}`}>
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <AchievementBadge icon={SEASON_CHAMPION.icon} level={champion.unlocked_at ? 5 : 0} size={54} />
                  <Text variant="smallStrong" align="center" numberOfLines={1}>Season Champion</Text>
                  <Text variant="caption" tone={champion.unlocked_at ? 'gold' : 'faint'} align="center">
                    {champion.unlocked_at ? `Player of the Season${champion.value > 1 ? ` ×${champion.value}` : ''}` : 'Win Player of the Season'}
                  </Text>
                </View>
              </Card>
            )}
          </View>

          <SectionTitle title="Player card" />
          <StylePicker points={d.points} current={d.card_style} />
        </>
      )}
      {!!open && !!d && <TrackSheet t={open} players={d.players} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

function TrackTile({ t, index, width, onPress }: { t: TrackState; index: number; width: string; onPress: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const [enter] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(enter, { toValue: 1, duration: 360, delay: 45 * index, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start();
  }, [enter, index, reduceMotion]);
  const info = t.level ? levelInfo(t.level) : null;
  const span = t.next ? t.next - t.prev : 1;
  const into = t.next ? Math.max(0, t.value - t.prev) : 1;
  return (
    <Animated.View style={{ width: width as any, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
      <Card onPress={onPress} accessibilityLabel={`${t.def.name}, ${info ? info.label : 'not started'}${t.next ? `, ${t.value} of ${t.next} to ${levelInfo(t.level + 1).label}` : ', maxed'}`}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <AchievementBadge icon={t.def.icon} level={t.level} progress={into} target={span} size={54} />
          <Text variant="smallStrong" align="center" numberOfLines={1}>{t.def.name}</Text>
          <Text variant="caption" align="center" style={{ color: info ? info.colour : colors.textFaint }}>{info ? info.label : 'Not started'}</Text>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {[1, 2, 3, 4, 5].map((l) => (
              <View key={l} style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: l <= t.level ? levelInfo(l).colour : colors.surfaceAlt }} />
            ))}
          </View>
          <Text variant="caption" tone="faint" align="center" numberOfLines={1}>
            {t.next ? `${t.value} / ${t.next}` : 'Maxed out'}
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}

function TrackSheet({ t, players, onClose }: { t: TrackState; players: number; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible onClose={onClose} title={t.def.name}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: space.xs }}>
        {t.items.map((i) => {
          const lvl = i.level ?? 1;
          const on = !!i.unlocked_at;
          const rarity = rarityLabel(i.holders, players);
          return (
            <Row key={i.code} gap={space.md} style={{ paddingVertical: space.sm }}>
              <AchievementBadge icon={t.def.icon} level={on ? lvl : 0} progress={Math.min(i.value, i.target)} target={i.target} size={44} animate={false} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" style={{ color: on ? levelInfo(lvl).colour : colors.textMuted }}>{levelInfo(lvl).label}</Text>
                <Text variant="small" tone="muted">{i.description}</Text>
                <Text variant="caption" tone="faint">
                  {on ? `Unlocked ${formatDate(i.unlocked_at!)}` : `${Math.min(i.value, i.target)} / ${i.target}`}{rarity ? ` · ${rarity}` : ''}
                </Text>
              </View>
              {on && (
                <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`Share ${t.def.name} ${levelInfo(lvl).label}`}
                  onPress={() => shareText(`I reached ${levelInfo(lvl).label} in ${t.def.name} on MATCHDAY 🏅`).catch(() => undefined)}>
                  <Ionicons name="share-outline" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            </Row>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

/** Choose a player card style; locked ones show how many medal points they need. */
function StylePicker({ points, current }: { points: number; current: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const choose = async (s: CardStyle) => {
    if (points < s.points) return toast.show(`Earn ${s.points - points} more medal points to unlock ${s.name}.`);
    setBusy(s.id);
    try {
      await rpc('set_card_style', { p_style: s.id });
      haptics.success();
      qc.invalidateQueries({ queryKey: keys.myAchievements });
      qc.invalidateQueries({ queryKey: ['player'] });
      toast.success(`${s.name} card selected`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="small" tone="muted">Medal points unlock new looks for your player card and profile. Hall of Fame needs Legend in every medal.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
        {CARD_STYLES.map((s) => {
          const unlocked = points >= s.points;
          const selected = current === s.id;
          return (
            <Pressable key={s.id} onPress={() => choose(s)} disabled={!!busy} accessibilityRole="button"
              accessibilityState={{ selected, disabled: !unlocked }} accessibilityLabel={`${s.name} card${unlocked ? '' : `, needs ${plural(s.points, 'point')}`}`}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <View style={{ width: 118, height: 76, borderRadius: radius.md, overflow: 'hidden', borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : s.border ?? colors.border, opacity: unlocked ? 1 : 0.55 }}>
                <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
                  <Defs>
                    <LinearGradient id={`cs-${s.id}`} x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={s.from} />
                      <Stop offset="1" stopColor={s.to} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#cs-${s.id})`} />
                </Svg>
                <View style={{ flex: 1, padding: space.sm, justifyContent: 'space-between' }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="caption" color={s.accent} style={{ fontWeight: '700' }}>{s.name}</Text>
                    {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} /> : !unlocked ? <Ionicons name="lock-closed" size={13} color={s.muted} /> : null}
                  </Row>
                  <Text variant="caption" color={s.muted}>{unlocked ? (selected ? 'In use' : 'Tap to use') : plural(s.points, 'point')}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {busy ? <Button title="Saving…" variant="ghost" size="sm" loading /> : null}
    </View>
  );
}
