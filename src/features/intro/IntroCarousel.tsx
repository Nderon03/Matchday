import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Text, useToast } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { LogoVisual, PitchVisual, StatsVisual } from './visuals';
import { env } from '@/lib/env';
import { friendlyAuthError, signInWithProvider } from '@/features/auth';

export const INTRO_SEEN_KEY = 'matchday.introSeen';

const SLIDES = [
  { title: 'Your weekly game, sorted', body: 'Invite the squad, see who’s in and collect fees. No more chasing in the group chat.', Visual: LogoVisual },
  { title: 'Fair teams, every time', body: 'Balanced line-ups suggested from real ratings and form. Drag to tweak, then confirm.', Visual: PitchVisual },
  { title: 'Stats that settle arguments', body: 'Goals, assists, ratings and Man of the Match votes. Every game counts.', Visual: StatsVisual },
];

const native = Platform.OS !== 'web';
const DOT = 8;
const DOT_GAP = 10;

/** First-launch intro: three swipeable slides with small entrance animations, ending in sign-up / sign-in. */
export function IntroCarousel() {
  const { colors, reduceMotion } = useTheme();
  const toast = useToast();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [scrollX] = useState(() => new Animated.Value(0));
  const scroller = useRef<{ scrollTo: (o: { x: number; animated?: boolean }) => void } | null>(null);
  const last = SLIDES.length - 1;

  // Returning visitors (signed out, or came back later) go straight to the last slide.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((v) => { if (alive && v) setIndex(last); })
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, [last]);

  useEffect(() => {
    if (index === last) AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => undefined);
  }, [index, last]);

  // Keep the scroll position in step with the index (initial jump, Next/Skip, and resizes on web).
  useEffect(() => {
    if (!width || !ready) return;
    scroller.current?.scrollTo({ x: index * width, animated: false });
    scrollX.setValue(index * width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, ready]);

  const goTo = (i: number) => {
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: !reduceMotion });
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.max(0, Math.min(last, Math.round(e.nativeEvent.contentOffset.x / width))));
  };

  const onLast = index === last;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="overline" tone="primary" style={{ letterSpacing: 2 }}>MATCHDAY</Text>
        {!onLast && (
          <Pressable onPress={() => goTo(last)} accessibilityRole="button" accessibilityLabel="Skip intro" hitSlop={12} style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>
            <Text variant="smallStrong" tone="muted">Skip</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }} onLayout={onLayout}>
        {width > 0 && ready && (
          <Animated.ScrollView
            ref={scroller as any}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: native })}
            onMomentumScrollEnd={onEnd}
            onScrollEndDrag={Platform.OS === 'web' ? onEnd : undefined}
            style={{ flex: 1 }}
          >
            {SLIDES.map(({ title, body, Visual }, i) => {
              const range = [(i - 1) * width, i * width, (i + 1) * width];
              const visualShift = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.35, 0, -width * 0.35], extrapolate: 'clamp' });
              const fade = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
              const textShift = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.15, 0, -width * 0.15], extrapolate: 'clamp' });
              return (
                <View key={title} style={{ width, flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xxl }}
                  accessibilityElementsHidden={i !== index} importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}>
                  <Animated.View style={{ minHeight: 300, justifyContent: 'center', alignItems: 'center', opacity: fade, transform: [{ translateX: visualShift }] }}>
                    <Visual active={i === index} />
                  </Animated.View>
                  <Animated.View style={{ alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, maxWidth: 380, opacity: fade, transform: [{ translateX: textShift }] }}>
                    <Text variant="h1" align="center" accessibilityRole="header">{title}</Text>
                    <Text tone="muted" align="center">{body}</Text>
                  </Animated.View>
                </View>
              );
            })}
          </Animated.ScrollView>
        )}
      </View>

      <View style={{ alignItems: 'center', paddingVertical: space.lg }} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
        <View style={{ flexDirection: 'row', gap: DOT_GAP }}>
          {SLIDES.map((s, i) => (
            <Pressable key={s.title} onPress={() => goTo(i)} accessibilityRole="button" accessibilityLabel={`Go to slide ${i + 1}`} hitSlop={8}>
              <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.borderStrong }} />
            </Pressable>
          ))}
          {/* the active pill glides between dots, stretching mid-swipe */}
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', left: 0, top: 0, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.primary,
            transform: width ? [
              { translateX: scrollX.interpolate({ inputRange: SLIDES.map((_, i) => i * width), outputRange: SLIDES.map((_, i) => i * (DOT + DOT_GAP)), extrapolate: 'clamp' }) },
              { scaleX: scrollX.interpolate({ inputRange: SLIDES.flatMap((_, i) => (i < last ? [i * width, (i + 0.5) * width] : [i * width])), outputRange: SLIDES.flatMap((_, i) => (i < last ? [1, 2.2] : [1])), extrapolate: 'clamp' }) },
            ] : [{ translateX: index * (DOT + DOT_GAP) }],
          }} />
        </View>
      </View>

      <View style={{ gap: space.sm, paddingBottom: space.lg, minHeight: 116, justifyContent: 'flex-end' }}>
        {onLast ? (
          <>
            {env.oauthProviders.includes('google') && (
              <Button title="Continue with Google" variant="outline" size="lg" icon="logo-google"
                onPress={() => signInWithProvider('google').catch((e) => toast.error(friendlyAuthError(e)))} />
            )}
            <Button title="Create account" size="lg" onPress={() => router.push('/sign-up')} />
            <Button title="I already have an account" variant="secondary" size="lg" onPress={() => router.push('/sign-in')} />
          </>
        ) : (
          <>
            <Button title="Next" size="lg" iconRight="arrow-forward" onPress={() => goTo(index + 1)} />
            <Button title="I already have an account" variant="ghost" size="lg" onPress={() => router.push('/sign-in')} />
          </>
        )}
      </View>
    </View>
  );
}
