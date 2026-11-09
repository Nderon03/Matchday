import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Text } from '@/components/ui';
import { Confetti } from '@/components/football/Confetti';
import { formatKickoff, plural } from '@/domain/format';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';
const seenKey = (uid: string, gid: string) => `matchday.groupWelcome.${uid}.${gid}`;
/** Only for players who joined recently, so existing members never get it out of the blue. */
const RECENT_MS = 7 * 86400_000;

interface Member { user_id: string; role: string; joined_at: string; profile: { display_name: string; avatar_url: string | null } }

/**
 * "Welcome to the group": shown once, the first time a new member opens a group they've just
 * joined (by invite, link, QR, Discover or an approved request). Not shown to the creator.
 */
export function GroupWelcome({ userId, group, members, nextGame }: {
  userId: string;
  group: { id: string; name: string; logo_url: string | null; location: string | null };
  members: Member[];
  nextGame: { id: string; name: string; starts_at: string } | null;
}) {
  const me = members.find((m) => m.user_id === userId);
  const [now] = useState(() => Date.now());
  const eligible = !!me && me.role !== 'owner' && now - new Date(me.joined_at).getTime() < RECENT_MS;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(userId, group.id))
      .then((v) => { if (alive && !v) setShow(true); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [eligible, userId, group.id]);

  if (!show || !me) return null;
  const close = () => {
    setShow(false);
    AsyncStorage.setItem(seenKey(userId, group.id), '1').catch(() => undefined);
  };
  // which number player you are, by when people joined
  const order = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const number = order.findIndex((m) => m.user_id === userId) + 1;
  const squad = order.filter((m) => m.user_id !== userId).slice(-7).reverse();
  return <Welcome group={group} number={number} total={members.length} squad={squad} nextGame={nextGame} onClose={close} />;
}

function Welcome({ group, number, total, squad, nextGame, onClose }: {
  group: { name: string; logo_url: string | null; location: string | null };
  number: number;
  total: number;
  squad: Member[];
  nextGame: { id: string; name: string; starts_at: string } | null;
  onClose: () => void;
}) {
  const { colors, reduceMotion } = useTheme();
  const v = (start = 0) => new Animated.Value(reduceMotion ? 1 : start);
  const [card] = useState(() => v());
  const [logo] = useState(() => v());
  const [ring] = useState(() => v());
  const [text] = useState(() => v());
  const [faces] = useState(() => squad.map(() => v()));
  const [cta] = useState(() => v());

  useEffect(() => {
    haptics.success();
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(card, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.parallel([
        Animated.spring(logo, { toValue: 1, friction: 5, tension: 70, useNativeDriver: native }),
        Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
        Animated.timing(text, { toValue: 1, duration: 420, delay: 200, useNativeDriver: native }),
      ]),
      Animated.stagger(70, faces.map((f) => Animated.spring(f, { toValue: 1, friction: 6, tension: 90, useNativeDriver: native }))),
      Animated.timing(cta, { toValue: 1, duration: 260, useNativeDriver: native }),
    ]).start();
  }, [card, logo, ring, text, faces, cta, reduceMotion]);

  const rise = (a: Animated.Value, by = 12) => ({ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [by, 0] }) }] });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      {!reduceMotion && <Confetti colour="#22C55E" />}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.centre, { flex: undefined, flexGrow: 1 }]} bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View accessibilityViewIsModal style={[styles.card, {
          backgroundColor: colors.surface, borderColor: `${colors.primary}55`,
          opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }]}>
          <View style={{ height: 128, alignItems: 'center', justifyContent: 'center' }}>
            {/* a ring that bursts outwards behind the badge */}
            <Animated.View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: colors.primary,
              opacity: ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.8, 0.35, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.35] }) }] }} />
            <View style={{ position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primaryMuted }} />
            <Animated.View style={{ transform: [
              { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
            ], opacity: logo.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }) }}>
              <Avatar uri={group.logo_url} name={group.name} size={84} ring={colors.primary} />
            </Animated.View>
          </View>

          <Animated.View style={[{ alignItems: 'center', gap: space.xs }, rise(text)]}>
            <Text variant="overline" tone="primary">You’re in</Text>
            <Text variant="h2" align="center" accessibilityRole="header">Welcome to {group.name}</Text>
            <Text tone="muted" align="center">
              You’re player #{number} of {total}{group.location ? ` · ${group.location}` : ''}
            </Text>
          </Animated.View>

          {squad.length > 0 && (
            <View style={{ alignItems: 'center', gap: space.xs }}>
              <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={`Squad includes ${squad.map((m) => m.profile.display_name).join(', ')}`}>
                {squad.map((m, i) => (
                  <Animated.View key={m.user_id} style={{ marginLeft: i ? -10 : 0, zIndex: squad.length - i,
                    opacity: faces[i], transform: [{ translateY: faces[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: faces[i] }] }}>
                    <View style={{ borderRadius: 999, borderWidth: 2, borderColor: colors.surface }}>
                      <Avatar uri={m.profile.avatar_url} name={m.profile.display_name} size={34} />
                    </View>
                  </Animated.View>
                ))}
              </View>
              <Text variant="caption" tone="faint">
                {squad[0].profile.display_name.split(' ')[0]}{total > 2 ? ` and ${plural(total - 2, 'other')} are` : ' is'} already here
              </Text>
            </View>
          )}

          {!!nextGame && (
            <Animated.View style={[{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
              borderRadius: radius.md, backgroundColor: colors.surfaceAlt }, rise(cta, 8)]}>
              <Ionicons name="football-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Next game</Text>
                <Text variant="smallStrong" numberOfLines={1}>{nextGame.name} · {formatKickoff(nextGame.starts_at)}</Text>
              </View>
            </Animated.View>
          )}

          <Animated.View style={[{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }, rise(cta, 8)]}>
            {nextGame ? (
              <>
                <Button title="Later" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
                <Button title="See the game" style={{ flex: 1 }} onPress={() => { onClose(); router.push(`/session/${nextGame.id}`); }} />
              </>
            ) : (
              <Button title="Let’s go" style={{ flex: 1 }} onPress={onClose} />
            )}
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 400, borderRadius: radius.xl, borderWidth: 1, padding: space.xl, gap: space.lg, alignItems: 'center' },
});
