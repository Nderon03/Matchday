import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Text } from '@/components/ui';
import { Confetti } from '@/components/football/Confetti';
import { useNotifications } from '@/hooks/queries';
import { q } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { nameList } from '@/domain/format';

const native = Platform.OS !== 'web';
const first = (name?: string | null) => (name ?? '').split(' ')[0] || 'them';

export interface Friend { id: string; display_name: string; avatar_url: string | null }

/** Two players slide in, meet in the middle, a 🤝 pops and shakes. Used wherever a friendship starts. */
export function HandshakeScene({ them, onClose }: { them: Friend; onClose?: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const { profile, userId } = useAuth();
  const v = () => new Animated.Value(reduceMotion ? 1 : 0);
  const [meet] = useState(v);
  const [shake] = useState(v);
  const [text] = useState(v);
  useEffect(() => {
    haptics.success();
    if (reduceMotion) return;
    Animated.sequence([
      Animated.spring(meet, { toValue: 1, friction: 6, tension: 55, useNativeDriver: native }),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(2)), useNativeDriver: native }),
          Animated.loop(Animated.sequence([
            Animated.timing(shake, { toValue: 1.25, duration: 120, useNativeDriver: native }),
            Animated.timing(shake, { toValue: 0.75, duration: 120, useNativeDriver: native }),
          ]), { iterations: 3 }),
          Animated.timing(shake, { toValue: 1, duration: 120, useNativeDriver: native }),
        ]),
        Animated.timing(text, { toValue: 1, duration: 420, delay: 250, useNativeDriver: native }),
      ]),
    ]).start();
  }, [meet, shake, text, reduceMotion]);
  const name = first(them.display_name);
  const side = (from: number) => ({ opacity: meet, transform: [{ translateX: meet.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] });
  const go = (path: Parameters<typeof router.push>[0]) => { onClose?.(); router.push(path); };
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md }}>
        <Animated.View style={side(-160)}><Avatar uri={profile?.avatar_url} name={profile?.display_name} size={84} ring={colors.primary} /></Animated.View>
        <Animated.Text accessibilityLabel="Handshake" style={{ fontSize: 50, lineHeight: 62,
          opacity: shake.interpolate({ inputRange: [0, 0.3, 1.25], outputRange: [0, 1, 1] }),
          transform: [
            { scale: shake.interpolate({ inputRange: [0, 0.75, 1, 1.25], outputRange: [0.2, 1, 1, 1] }) },
            { rotate: shake.interpolate({ inputRange: [0, 0.75, 1, 1.25], outputRange: ['0deg', '-14deg', '0deg', '14deg'] }) },
          ] }}>🤝</Animated.Text>
        <Animated.View style={side(160)}><Avatar uri={them.avatar_url} name={them.display_name} size={84} ring={colors.primary} /></Animated.View>
      </View>
      <Animated.View style={{ alignItems: 'center', gap: space.xs, opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <Text variant="overline" tone="primary">New teammate</Text>
        <Text variant="h1" align="center">You and {name} are now friends</Text>
        <Text tone="muted" align="center">Invite each other to games, compare stats and see who wins more together.</Text>
      </Animated.View>
      <Animated.View style={{ gap: space.sm, opacity: text }}>
        <Button title={`See ${name}’s profile`} size="lg" onPress={() => go(`/player/${them.id}`)} />
        <Button title="Compare our stats" variant="secondary" size="lg" icon="git-compare-outline"
          onPress={() => go({ pathname: '/compare', params: { a: userId ?? '', b: them.id } })} />
        {!!onClose && <Button title="Done" variant="ghost" onPress={onClose} />}
      </Animated.View>
    </View>
  );
}

/** The handshake as an overlay, for friendships made inside the app. */
export function HandshakeModal({ them, onClose }: { them: Friend | null; onClose: () => void }) {
  const { colors, reduceMotion } = useTheme();
  if (!them) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      {!reduceMotion && <Confetti colour="#22C55E" />}
      <View style={styles.centre} pointerEvents="box-none">
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: `${colors.primary}55` }]}>
          <HandshakeScene them={them} onClose={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const seenKey = (uid: string) => `matchday.friendsCelebrated.${uid}`;

/**
 * The other side of new friendships: when people accept your requests (or open your friend link)
 * you get a celebration, live or the next time you open the app. One new friend: the handshake.
 * Several since you last looked: one "You've got 5 new friends" moment, not five in a row.
 * The first run on a device only records "now", so there's no backlog.
 */
export function FriendAcceptedWatcher() {
  const { userId } = useAuth();
  const notifications = useNotifications();
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(userId)).then((v) => {
      if (!alive) return;
      if (v) return setSeen(v);
      const now = new Date().toISOString();
      setSeen(now);
      AsyncStorage.setItem(seenKey(userId), now).catch(() => undefined);
    }).catch(() => alive && setSeen(new Date().toISOString()));
    return () => { alive = false; };
  }, [userId]);
  const pending = useMemo(() => (seen ? (notifications.data ?? [])
    .filter((n) => n.type === 'friend_accepted' && n.created_at > seen && (n.data as any)?.user_id) : []), [notifications.data, seen]);
  const ids = useMemo(() => [...new Set(pending.map((n) => (n.data as any).user_id as string))].sort(), [pending]);
  const people = useQuery({
    queryKey: ['player-basic', ids],
    enabled: ids.length > 0,
    queryFn: () => q<Friend[]>(supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids)),
  });
  if (!userId || !ids.length || !people.data?.length) return null;
  const done = () => {
    const latest = pending.reduce((m, n) => (n.created_at > m ? n.created_at : m), seen!);
    setSeen(latest);
    AsyncStorage.setItem(seenKey(userId), latest).catch(() => undefined);
  };
  if (people.data.length === 1) return <HandshakeModal them={people.data[0]} onClose={done} />;
  return <NewFriendsModal friends={people.data} onClose={done} />;
}

/** Several new friends at once: one celebration with everyone's faces around the handshake. */
function NewFriendsModal({ friends, onClose }: { friends: Friend[]; onClose: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const shown = friends.slice(0, 8);
  const [pop] = useState(() => shown.map(() => new Animated.Value(reduceMotion ? 1 : 0)));
  const [hand] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    haptics.success();
    if (reduceMotion) return;
    Animated.sequence([
      Animated.spring(hand, { toValue: 1, friction: 4, tension: 90, useNativeDriver: native }),
      Animated.stagger(90, pop.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 90, useNativeDriver: native }))),
    ]).start();
  }, [hand, pop, reduceMotion]);
  const names = friends.map((f) => first(f.display_name));
  const list = nameList(names);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      {!reduceMotion && <Confetti colour="#22C55E" />}
      <View style={styles.centre} pointerEvents="box-none">
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: `${colors.primary}55`, gap: space.lg, alignItems: 'center' }]}>
          <Animated.Text accessibilityLabel="Handshake" style={{ fontSize: 50, lineHeight: 62, transform: [{ scale: hand.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>🤝</Animated.Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm }}>
            {shown.map((f, i) => (
              <Animated.View key={f.id} style={{ opacity: pop[i], transform: [{ scale: pop[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
                <Avatar uri={f.avatar_url} name={f.display_name} size={46} ring={colors.primary} />
              </Animated.View>
            ))}
          </View>
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Text variant="overline" tone="primary">New teammates</Text>
            <Text variant="h1" align="center">You’ve got {friends.length} new friends</Text>
            <Text tone="muted" align="center">{list} said yes. Invite them to your next game.</Text>
          </View>
          <Button title="See my friends" size="lg" style={{ alignSelf: 'stretch' }} onPress={() => { onClose(); router.push('/friends'); }} />
          <Button title="Done" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.xl, borderWidth: 1, padding: space.xl },
});
