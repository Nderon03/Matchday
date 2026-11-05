import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { SessionDetail } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useOnce } from './useOnce';

const native = Platform.OS !== 'web';

interface Player { key: string; name: string; avatar: string | null; me: boolean; keeper: boolean; guest?: boolean }

/**
 * "Teams are out": the first time a player opens confirmed line-ups, both teams drop in one by
 * one (theirs lands last, with a glow) and it says which side they're on. Not for hosts (they made them).
 */
export function TeamsReveal({ detail: d, fixture, userId }: { detail: SessionDetail; fixture: SessionDetail['fixtures'][number]; userId: string }) {
  const myTeam = fixture.teams.find((t) => t.players.some((p) => p.user_id === userId));
  const eligible = !!fixture.lineup_confirmed_at && !fixture.played && !d.isManager && !!myTeam && d.session.status === 'scheduled';
  const { due, markDone } = useOnce(eligible ? `matchday.teamsReveal.${fixture.id}.${fixture.lineup_confirmed_at}` : null, eligible);
  if (!due || !myTeam) return null;
  const name = (p: SessionDetail['fixtures'][number]['teams'][number]['players'][number]) => {
    if (p.user_id) {
      const a = d.attendance.find((x) => x.user_id === p.user_id);
      return { name: a?.profile.display_name ?? 'Player', avatar: a?.profile.avatar_url ?? null };
    }
    const g = d.guests.find((x) => x.id === (p as any).guest_id);
    return { name: g?.name ?? 'Guest', avatar: null, guest: true };
  };
  const teams = fixture.teams.map((t) => ({
    id: t.id, name: t.name, colour: t.colour ?? '#22C55E',
    players: t.players.filter((p) => !p.is_substitute).map((p) => ({ key: p.user_id ?? (p as any).guest_id, ...name(p), me: p.user_id === userId, keeper: !!p.is_goalkeeper }))
      // my token lands last
      .sort((a, b) => Number(a.me) - Number(b.me)),
  }));
  return <Reveal teams={teams} mine={myTeam.name} mineColour={myTeam.colour ?? '#22C55E'} onClose={markDone} />;
}

function Reveal({ teams, mine, mineColour, onClose }: { teams: { id: string; name: string; colour: string; players: Player[] }[]; mine: string; mineColour: string; onClose: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const order: { t: number; i: number }[] = [];
  const longest = Math.max(...teams.map((t) => t.players.length));
  // alternate between teams so both fill up together, mine last
  for (let i = 0; i < longest; i++) teams.forEach((t, ti) => { if (t.players[i] && !t.players[i].me) order.push({ t: ti, i }); });
  teams.forEach((t, ti) => t.players.forEach((p, i) => { if (p.me) order.push({ t: ti, i }); }));
  const [vals] = useState(() => teams.map((t) => t.players.map(() => new Animated.Value(reduceMotion ? 1 : 0))));
  const [title] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [verdict] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) { haptics.success(); return; }
    Animated.sequence([
      Animated.timing(title, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.stagger(110, order.map(({ t, i }) => Animated.spring(vals[t][i], { toValue: 1, friction: 6, tension: 80, useNativeDriver: native }))),
      Animated.spring(verdict, { toValue: 1, friction: 5, tension: 80, useNativeDriver: native }),
    ]).start(() => haptics.success());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.centre} pointerEvents="box-none">
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Animated.View style={{ alignItems: 'center', opacity: title, transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}>
            <Text variant="overline" tone="primary">Line-ups confirmed</Text>
            <Text variant="h2" accessibilityRole="header">Teams are out</Text>
          </Animated.View>
          <View style={{ flexDirection: 'row', gap: space.md, alignSelf: 'stretch' }}>
            {teams.map((t, ti) => (
              <View key={t.id} style={{ flex: 1, gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colour, borderWidth: 1, borderColor: colors.borderStrong }} />
                  <Text variant="bodyStrong" numberOfLines={1}>{t.name}</Text>
                </View>
                {t.players.map((p, i) => (
                  <Animated.View key={p.key} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: radius.md,
                    backgroundColor: p.me ? `${t.colour}33` : colors.surfaceAlt, borderWidth: p.me ? 1.5 : 0, borderColor: t.colour,
                    opacity: vals[ti][i], transform: [{ translateY: vals[ti][i].interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }, { scale: vals[ti][i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                  }}>
                    <Avatar uri={p.avatar} name={p.name} size={26} ring={p.me ? t.colour : undefined} />
                    <Text variant="small" numberOfLines={1} style={{ flex: 1, fontWeight: p.me ? '700' : '400' }}>{p.me ? 'You' : p.name.split(' ')[0]}{p.guest ? ' (guest)' : ''}{p.keeper ? ' 🧤' : ''}</Text>
                  </Animated.View>
                ))}
              </View>
            ))}
          </View>
          <Animated.View style={{ alignSelf: 'stretch', alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: `${mineColour}26`,
            opacity: verdict, transform: [{ scale: verdict.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
            <Text variant="h3" align="center">You’re on {mine}</Text>
          </Animated.View>
          <Button title="See the pitch" style={{ alignSelf: 'stretch' }} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 440, borderRadius: radius.xl, borderWidth: 1, padding: space.xl, gap: space.lg, alignItems: 'center', maxHeight: '92%' },
});
