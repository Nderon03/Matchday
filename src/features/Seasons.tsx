import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Avatar, Button, Card, Text } from '@/components/ui';
import { Confetti } from '@/components/football/Confetti';
import { PhotoLaurel } from '@/components/football/CardFX';
import { SeasonEmblem, SeasonPip } from '@/components/football/SeasonBadge';
import { useCardSeasons } from '@/features/SeasonPips';
import { parseSeasonBadge } from '@/domain/seasonBadges';
import { rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { happyMoment } from '@/lib/review';
import { useNow } from '@/hooks/useNow';
import { plural } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';
const GOLD = '#F5C542';
const PURPLE = '#4C1D95';

interface SeasonGroup { group_id: string; group_name: string; games: number; my_games: number; needed: number; my_needed: number }
interface SeasonResult {
  season_id: string; season_name: string; season_label?: string; my_badge?: string | null; group_id: string; group_name: string; finalised_at: string; games: number | null;
  winners: { user_id: string; name: string; avatar_url: string | null; value: number }[];
}
export interface MySeasons { current: { name: string; starts_on: string; ends_on: string; label?: string }; groups: SeasonGroup[]; results: SeasonResult[] }

export const useMySeasons = (enabled = true) => useQuery({ queryKey: ['my-seasons'], enabled, queryFn: () => rpc<MySeasons>('get_my_seasons') });

/** Home: the season everyone's in, how long is left, and where you stand in your main group. */
export function SeasonCard({ data }: { data: MySeasons }) {
  const { colors } = useTheme();
  const now = useNow(60_000);
  const start = new Date(`${data.current.starts_on}T00:00:00`).getTime();
  const end = new Date(`${data.current.ends_on}T23:59:59`).getTime();
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400_000));
  const pct = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const g = data.groups.find((x) => x.games > 0) ?? data.groups[0];
  return (
    <Card onPress={g ? () => router.push(`/group/${g.group_id}`) : undefined} accessibilityLabel={`${data.current.name}, ends in ${plural(daysLeft, 'day')}`}>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Ionicons name="trophy-outline" size={18} color={GOLD} />
          <Text style={{ fontFamily: fonts.score, fontSize: 16, letterSpacing: 2, color: colors.text, flex: 1 }}>{data.current.label ? `${data.current.label.toUpperCase()} · ` : ''}{data.current.name.toUpperCase()}</Text>
          <Text variant="smallStrong" color={daysLeft <= 7 ? GOLD : colors.textMuted}>{daysLeft === 0 ? 'Ends today' : `${plural(daysLeft, 'day')} left`}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: GOLD }} />
        </View>
        {g ? (
          <Text variant="caption" tone="muted">
            {g.group_name}: {g.games >= g.needed ? `${plural(g.games, 'game')}, awards are on.` : `${g.games} of ${g.needed} games for awards.`}
            {' '}{g.my_games >= g.my_needed ? 'You’re in the running for Player of the Season.' : `Play ${g.my_needed - g.my_games} more to be in the running.`}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">Join a group to play for Player of the Season.</Text>
        )}
      </View>
    </Card>
  );
}

interface RaceRow { user_id: string; name: string; avatar_url: string | null; apps: number; rating: number | null; motm: number; score: number | null; eligible: boolean; rank: number | null }
export interface SeasonRaceData { season_name: string; season_label?: string; players?: number; players_needed?: number; ends_on: string; games: number; needed: number; min_apps: number; rows: RaceRow[] }
export const useSeasonRace = (groupId: string, enabled = true) =>
  useQuery({ queryKey: ['season-race', groupId], enabled, queryFn: () => rpc<SeasonRaceData>('get_season_race', { p_group: groupId }) });

const PODIUM = ['#F5C542', '#CDD5DF', '#E39A5B'];

/**
 * The race for Player of the Season: this season's live table, like a ranked ladder.
 * `top` shows only the leaders (plus you, if you're further down) with a link to the full race.
 */
export function SeasonRace({ groupId, userId, top, onSeeAll }: { groupId: string; userId?: string | null; top?: number; onSeeAll?: () => void }) {
  const { colors } = useTheme();
  const now = useNow(60_000);
  const race = useSeasonRace(groupId);
  const pips = useCardSeasons((race.data?.rows ?? []).map((r) => r.user_id));
  const d = race.data;
  if (!d) return null;
  const daysLeft = Math.max(0, Math.ceil((new Date(`${d.ends_on}T23:59:59`).getTime() - now) / 86400_000));
  const ranked = d.rows.filter((r) => r.rank !== null);
  const chasing = d.rows.filter((r) => r.rank === null);
  const me = d.rows.find((r) => r.user_id === userId);
  let shown = top ? ranked.slice(0, top) : ranked;
  if (top && me?.rank && !shown.includes(me)) shown = [...shown, me];
  const awardsOn = d.games >= d.needed;
  const row = (r: RaceRow) => {
    const mine = r.user_id === userId;
    const medal = r.rank && r.rank <= 3 ? PODIUM[r.rank - 1] : null;
    return (
      <View key={r.user_id} accessible accessibilityLabel={`${r.rank ? `${r.rank}. ` : ''}${r.name}${mine ? ' (you)' : ''}, ${plural(r.apps, 'game')}${r.score !== null ? `, score ${Number(r.score).toFixed(2)}` : ''}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.md,
          backgroundColor: mine ? colors.primaryMuted : 'transparent' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
          backgroundColor: medal ? `${medal}26` : 'transparent', borderWidth: medal ? 1 : 0, borderColor: medal ?? undefined }}>
          <Text variant="smallStrong" color={medal ?? colors.textMuted}>{r.rank ?? '–'}</Text>
        </View>
        <View><Avatar uri={r.avatar_url} name={r.name} size={32} /><SeasonPip code={pips[r.user_id]} avatar={32} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{r.name}{mine ? ' (you)' : ''}</Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {plural(r.apps, 'game')}{r.rating !== null ? ` · ${Number(r.rating).toFixed(1)} avg` : ''}{r.motm ? ` · ${r.motm} MOTM` : ''}
            {!r.eligible ? ` · play ${d.min_apps - r.apps} more` : ''}
          </Text>
        </View>
        {r.score !== null && r.eligible && (
          <Text style={{ fontFamily: fonts.score, fontSize: 18, color: medal ?? colors.text }}>{Number(r.score).toFixed(2)}</Text>
        )}
      </View>
    );
  };
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Ionicons name="trophy" size={18} color={GOLD} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Race for Player of the Season</Text>
            <Text variant="caption" tone="muted">{d.season_label ? `${d.season_label} · ` : ''}{d.season_name} · {daysLeft === 0 ? 'ends today' : `${plural(daysLeft, 'day')} left`}</Text>
          </View>
        </View>
        {!awardsOn && (
          <View style={{ gap: 4 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${(100 * d.games) / d.needed}%`, height: 6, borderRadius: 3, backgroundColor: GOLD }} />
            </View>
            <Text variant="caption" tone="muted">{d.games} of {d.needed} games played. Awards are on once the group plays {d.needed}.</Text>
          </View>
        )}
        {d.rows.length === 0 ? (
          <Text variant="small" tone="muted">The race starts with this season’s first game. Play at least {d.min_apps} games to be in the running.</Text>
        ) : (
          <>
            {shown.map(row)}
            {!ranked.length && <Text variant="small" tone="muted">No one has played {d.min_apps} games yet. You need half the group’s games to be in the running.</Text>}
            {!top && chasing.length > 0 && (
              <>
                <Text variant="overline" tone="muted" style={{ marginTop: space.sm }}>Not in the running yet · need {d.min_apps} games</Text>
                {chasing.map(row)}
              </>
            )}
            {!!top && me && !me.eligible && (
              <Text variant="caption" tone="muted">You’ve played {plural(me.apps, 'game')}. Play {d.min_apps - me.apps} more to join the race.</Text>
            )}
          </>
        )}
        {d.season_label !== 'Pre-season' && d.players_needed != null && (d.players ?? 0) < d.players_needed && (
          <Text variant="caption" tone="muted">Ranked season badges need {d.players_needed} different players this season ({d.players ?? 0} so far). Everyone with 3+ games still gets Squad.</Text>
        )}
        <Text variant="caption" tone="faint">Score = average rating + a bonus for MOTM awards and for turning up.</Text>
        {!!onSeeAll && d.rows.length > shown.length && (
          <Pressable onPress={onSeeAll} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
            <Text variant="smallStrong" tone="primary">See the full race ›</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

/** The big moment when a season ends: "Autumn 2026 is over…" then the Player of the Season, in the Hall of Fame colours. */
export function SeasonReveal({ data, userId }: { data: MySeasons; userId: string }) {
  const [seen, setSeen] = useState<Record<string, true> | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(data.results.map((r) => AsyncStorage.getItem(`matchday.seasonSeen.${r.season_id}`).then((v) => [r.season_id, !!v] as const)))
      .then((pairs) => { if (alive) setSeen(Object.fromEntries(pairs.filter(([, v]) => v).map(([k]) => [k, true]))); })
      .catch(() => alive && setSeen({}));
    return () => { alive = false; };
  }, [data.results]);
  if (!seen) return null;
  const next = data.results.find((r) => !seen[r.season_id]);
  if (!next) return null;
  const close = () => {
    AsyncStorage.setItem(`matchday.seasonSeen.${next.season_id}`, '1').catch(() => undefined);
    setSeen({ ...seen, [next.season_id]: true });
  };
  return <Reveal key={next.season_id} r={next} isMe={next.winners.some((w) => w.user_id === userId)} newSeason={data.current.label && data.current.label !== 'Pre-season' ? `${data.current.label} (${data.current.name})` : data.current.name} onClose={close} />;
}

function Reveal({ r, isMe, newSeason, onClose }: { r: SeasonResult; isMe: boolean; newSeason: string; onClose: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const [step] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [revealed, setRevealed] = useState(reduceMotion);
  const winners = r.winners;
  useEffect(() => {
    if (reduceMotion || !winners.length) { if (winners.length && isMe) haptics.unlock(); return; }
    const t = setTimeout(() => {
      Animated.timing(step, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start();
      setRevealed(true);
      if (isMe) { haptics.unlock(); } else haptics.goal();
    }, 1600);
    return () => clearTimeout(t);
  }, [reduceMotion, step, winners.length, isMe]);
  const done = () => { onClose(); if (isMe) happyMoment(); };
  const shared = winners.length > 1;
  const myBadge = parseSeasonBadge(r.my_badge);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={done} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg }} bounces={false}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 400, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 2, borderColor: GOLD, backgroundColor: '#12041F' }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: PURPLE, opacity: 0.55 }]} />
          <View style={{ padding: space.xl, gap: space.md, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.score, color: GOLD, fontSize: 15, letterSpacing: 3 }} align="center">
              {r.season_label ? `${r.season_label.toUpperCase()} IS OVER` : `${r.season_name.toUpperCase()} · SEASON OVER`}
            </Text>
            <Text variant="small" color="#D4B8F0" align="center">{r.season_label ? `${r.season_name} · ` : ''}{r.group_name}</Text>
            {winners.length ? (
              <>
                <Text variant="h2" color="#FFFFFF" align="center" accessibilityRole="header">{shared ? 'Players of the Season' : 'And the Player of the Season is…'}</Text>
                <Animated.View style={{ alignItems: 'center', gap: space.sm, opacity: step, transform: [{ scale: step.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}
                  accessible accessibilityLabel={`Player of the Season: ${winners.map((w) => w.name).join(' and ')}`}>
                  <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
                    {winners.slice(0, 3).map((w) => (
                      <View key={w.user_id}>
                        <PhotoLaurel size={shared ? 64 : 96} />
                        <Avatar uri={w.avatar_url} name={w.name} size={shared ? 64 : 96} ring={GOLD} />
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontFamily: fonts.scoreHeavy, fontSize: 30, lineHeight: 34, color: GOLD, marginTop: space.md }} align="center" numberOfLines={2}>
                    {winners.map((w) => w.name).join(' & ').toUpperCase()}
                  </Text>
                  <Text variant="caption" color="#D4B8F0">Season score {Number(winners[0].value).toFixed(2)}{r.games ? ` · ${plural(r.games, 'game')}` : ''}</Text>
                  {isMe && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: `${GOLD}22`, borderWidth: 1, borderColor: `${GOLD}88` }}>
                      <Ionicons name="trophy" size={18} color={GOLD} />
                      <Text variant="bodyStrong" color={GOLD}>That’s you! A different level.</Text>
                    </View>
                  )}
                </Animated.View>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={40} color={GOLD} />
                <Text variant="h3" color="#FFFFFF" align="center">No awards this time</Text>
                <Text variant="small" color="#D4B8F0" align="center">{r.group_name} played {plural(r.games ?? 0, 'game')}; awards need 7 in a season. Get a few more games in this time.</Text>
              </>
            )}
            {!!myBadge && (
              <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm, padding: space.md,
                borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: `${myBadge.info.colour}66` }}
                accessible accessibilityLabel={`Your season badge: ${myBadge.label}`}>
                <SeasonEmblem code={myBadge.code} size={48} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="#D4B8F0">Your season</Text>
                  <Text style={{ fontFamily: fonts.scoreHeavy, fontSize: 22, lineHeight: 26, color: myBadge.info.colour }}>{myBadge.label.toUpperCase()}</Text>
                  <Text variant="caption" color="#D4B8F0">{myBadge.info.hint}. It’s on your card now.</Text>
                </View>
              </View>
            )}
            <Text variant="caption" color="#D4B8F0" align="center" style={{ marginTop: space.sm }}>{newSeason} has started. Everyone’s back to zero for the season (career stats are kept).</Text>
            <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.sm }}>
              <Button title="See all awards" onPress={() => { done(); router.push(`/group/${r.group_id}`); }} />
              <Pressable onPress={done} accessibilityRole="button" style={{ alignSelf: 'center', padding: space.sm }}>
                <Text variant="smallStrong" color="#D4B8F0">Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
      {revealed && winners.length > 0 && !reduceMotion && <Confetti colour={GOLD} />}
    </Modal>
  );
}
