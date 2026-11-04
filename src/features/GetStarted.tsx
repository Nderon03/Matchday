import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Card, Row, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export interface GetStartedProgress {
  photo: boolean;
  group: boolean;
  friends: boolean;
  game: boolean;
}

const STEPS: { key: keyof GetStartedProgress; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap; href: string }[] = [
  { key: 'photo', title: 'Add a profile photo', hint: 'So your teammates know who’s who', icon: 'camera-outline', href: '/settings/profile' },
  { key: 'group', title: 'Join or create a group', hint: 'Your regular game lives here', icon: 'people-outline', href: '/group/discover' },
  { key: 'friends', title: 'Add your friends', hint: 'Compare stats and invite them faster', icon: 'person-add-outline', href: '/friends' },
  { key: 'game', title: 'Find a game near you', hint: 'Or create one and invite the squad', icon: 'football-outline', href: '/session/find' },
];

const dismissKey = (userId: string) => `matchday.getStarted.dismissed.${userId}`;

/** Home checklist for new players. Hides itself once every step is done or the player dismisses it. */
export function GetStarted({ userId, progress }: { userId: string; progress: GetStartedProgress }) {
  const { colors, reduceMotion } = useTheme();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [enter] = useState(() => new Animated.Value(0));
  const [fill] = useState(() => new Animated.Value(0));
  const done = STEPS.filter((s) => progress[s.key]).length;
  const visible = dismissed === false && done < STEPS.length;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(dismissKey(userId))
      .then((v) => alive && setDismissed(!!v))
      .catch(() => alive && setDismissed(false));
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) { enter.setValue(1); return; }
    Animated.spring(enter, { toValue: 1, friction: 8, tension: 50, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [visible, reduceMotion, enter]);

  useEffect(() => {
    if (!visible) return;
    const to = done / STEPS.length;
    if (reduceMotion) { fill.setValue(to); return; }
    Animated.timing(fill, { toValue: to, duration: 700, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [visible, done, reduceMotion, fill]);

  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(dismissKey(userId), '1').catch(() => undefined);
  };

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <Card>
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text variant="h3">Get started</Text>
              <Text variant="small" tone="muted">{done} of {STEPS.length} done</Text>
            </View>
            <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Hide get started checklist" hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textFaint} />
            </Pressable>
          </Row>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
          </View>
          <View>
            {STEPS.map((s, i) => {
              const ok = progress[s.key];
              return (
                <Pressable
                  key={s.key}
                  disabled={ok}
                  onPress={() => router.push(s.href as any)}
                  accessibilityRole="button"
                  accessibilityState={{ checked: ok, disabled: ok }}
                  accessibilityLabel={`${s.title}${ok ? ', done' : ''}`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Row gap={space.md} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: ok ? colors.primary : colors.surfaceAlt }}>
                      <Ionicons name={ok ? 'checkmark' : s.icon} size={16} color={ok ? colors.onPrimary : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" tone={ok ? 'faint' : 'default'} style={ok ? { textDecorationLine: 'line-through' } : undefined}>{s.title}</Text>
                      {!ok && <Text variant="caption" tone="muted">{s.hint}</Text>}
                    </View>
                    {!ok && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
                  </Row>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
