import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coachmarks } from '@/features/Coachmarks';
import { useOnce } from '@/features/moments/useOnce';
import { SCREEN_TOURS, type TourId } from '@/features/screenTours';
import { tourRef } from '@/features/tourTargets';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

const native = Platform.OS !== 'web';
export const TIPS_KEY = 'matchday.tips';
export const tourKey = (id: string, uid: string) => `matchday.tour.${id}.${uid}`;

/** Marks something on screen that a tour can point at: <Spot id="matches.find">…</Spot> */
export function Spot({ id, ...props }: ViewProps & { id: string }) {
  return <View ref={tourRef(id)} collapsable={false} {...props} />;
}

/** The little help button: bobs with a sparkle while this screen has a tip you haven't seen. */
export function HelpButton({ onPress, fresh, label = 'How this screen works', size = 36 }: { onPress: () => void; fresh?: boolean; label?: string; size?: number }) {
  const { colors, reduceMotion } = useTheme();
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!fresh || reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(bob, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.delay(900),
    ]));
    loop.start();
    return () => loop.stop();
  }, [fresh, reduceMotion, bob]);
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: `${colors.primary}55`,
        transform: [
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
          { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] }) },
        ] }}>
        <Ionicons name="help" size={size * 0.55} color={colors.primary} />
        {!!fresh && (
          <View style={{ position: 'absolute', top: -3, right: -3 }}>
            <Ionicons name="sparkles" size={13} color={colors.warning} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * A screen's help: the button, and its quick tour. The tour plays by itself the first time you
 * open the screen (after the main app tour, unless tips are switched off in Settings); the
 * button replays it whenever you like.
 */
export function ScreenHelp({ id, ready = true }: { id: TourId; ready?: boolean }) {
  const { userId } = useAuth();
  const tour = SCREEN_TOURS[id];
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    Promise.all([AsyncStorage.getItem(TIPS_KEY), AsyncStorage.getItem(`matchday.appTour.${userId}`)])
      .then(([tips, appTour]) => { if (alive) setAllowed(tips !== 'off' && !!appTour); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [userId]);
  // "fresh" (sparkle) until you've seen it; auto-plays only when tips are on
  const seen = useOnce(userId ? tourKey(id, userId) : null, true);
  const auto = seen.due && allowed && ready;
  const done = () => { setOpen(false); seen.markDone(); };
  return (
    <>
      <View ref={tourRef(`help.${id}`)} collapsable={false}>
        <HelpButton fresh={seen.due} onPress={() => setOpen(true)} label={`How ${tour.name} works`} />
      </View>
      <Coachmarks steps={tour.steps} visible={open || auto} onDone={done} finishLabel="Got it" />
    </>
  );
}
