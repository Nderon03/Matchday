import React, { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type HostInstance } from 'react-native';
import { Button, Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useScreenScroll } from '@/components/ui/ScreenScroll';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';

export interface CoachStep {
  /** the thing to point at (a View with collapsable={false}); steps whose target isn't on screen are skipped */
  target?: RefObject<HostInstance | null>;
  emoji: string;
  title: string;
  body: string;
}
interface Rect { x: number; y: number; w: number; h: number; centred?: boolean }

const BUBBLE_GUESS = 190;
const MAX_HOLE = 0.4;
/** whether something needs scrolling into view to point at it with a bubble */
const needsScroll = (r: Rect, sh: number) => {
  const h = Math.min(r.h, sh * MAX_HOLE);
  const visible = r.y >= 0 && r.y + h <= sh;
  const room = r.y + h + 20 + BUBBLE_GUESS <= sh || r.y - 20 - BUBBLE_GUESS >= 0;
  return !visible || !room;
};

const measure = (ref: RefObject<HostInstance | null>) => new Promise<Rect | null>((resolve) => {
  const node = ref.current;
  if (!node) return resolve(null);
  node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
});

/**
 * A short guided tour: dims the screen, lights up one button at a time and explains it in a
 * speech bubble with an arrow. Tap anywhere (or Next) to go on; Skip ends it.
 */
export function Coachmarks({ steps, visible, onDone, finishLabel = 'Got it' }: {
  steps: CoachStep[];
  visible: boolean;
  /** `finished` is false when skipped */
  onDone: (finished: boolean) => void;
  finishLabel?: string;
}) {
  const { colors, reduceMotion } = useTheme();
  const { width: sw, height: sh } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [appear] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  // the latest steps / callback, without restarting the tour when the screen behind re-renders
  const latest = useRef({ steps, onDone });
  useEffect(() => { latest.current = { steps, onDone }; });

  const scroll = useScreenScroll();
  const scroller = useRef(scroll);
  const winH = useRef(sh);
  useEffect(() => { scroller.current = scroll; winH.current = sh; });
  const [bubbleH, setBubbleH] = useState(BUBBLE_GUESS);

  const go = useCallback(async (from: number) => {
    const list = latest.current.steps;
    // find the next step that's actually on screen
    for (let i = from; i < list.length; i++) {
      // no target: a centred card (a welcome or a closing note)
      const t = list[i].target;
      let r = t ? await measure(t) : { x: 0, y: 0, w: 0, h: 0, centred: true };
      // off screen, or no room for the bubble either side: scroll it into view first
      if (r && t && needsScroll(r, winH.current) && scroller.current) {
        scroller.current.scrollBy(r.y - winH.current * 0.22);
        await new Promise((res) => setTimeout(res, 450));
        r = await measure(t);
      }
      if (r) { setIndex(i); setRect(r); return true; }
    }
    return false;
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    // let the screen settle before measuring
    const t = setTimeout(() => { go(0).then((ok) => { if (alive && !ok) latest.current.onDone(false); }); }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [visible, go]);

  useEffect(() => {
    if (!visible || !rect) return;
    appear.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) Animated.timing(appear, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, rect, appear, pulse, reduceMotion]);

  if (!visible || !rect) return null;
  const step = steps[index];
  const last = !steps.slice(index + 1).length;
  const next = async () => {
    haptics.tap();
    if (last || !(await go(index + 1))) { setRect(null); onDone(true); }
  };
  const skip = () => { setRect(null); onDone(false); };

  const dots = (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {steps.map((_, i) => <View key={i} style={{ width: i === index ? 12 : 5, height: 5, borderRadius: 3, backgroundColor: i === index ? colors.primary : colors.borderStrong }} />)}
    </View>
  );
  if (rect.centred) {
    return (
      <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={skip}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: space.lg }]}>
          <Animated.View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, gap: space.md, alignItems: 'center',
            opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
            <Animated.Text style={{ fontSize: 46, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>{step.emoji}</Animated.Text>
            <Text variant="h2" align="center">{step.title}</Text>
            <Text tone="muted" align="center">{step.body}</Text>
            {dots}
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              {!last && <Button title="Skip" variant="secondary" style={{ flex: 1 }} onPress={skip} />}
              <Button title={last ? finishLabel : index === 0 ? 'Show me' : 'Next'} style={{ flex: 1 }} onPress={next} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  const pad = 6;
  // very tall things (a whole grid) are lit from the top, so the bubble still fits
  const hole = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: Math.min(rect.h, sh * MAX_HOLE) + pad * 2 };
  const fitsBelow = hole.y + hole.h + 14 + bubbleH <= sh - 8;
  const fitsAbove = hole.y - 14 - bubbleH >= 8;
  const below = fitsBelow || !fitsAbove;
  const bubbleTop = Math.min(hole.y + hole.h + 14, sh - bubbleH - 8);
  const bubbleW = Math.min(320, sw - space.lg * 2);
  const centre = hole.x + hole.w / 2;
  const bubbleX = Math.max(space.lg, Math.min(sw - space.lg - bubbleW, centre - bubbleW / 2));
  const arrowX = Math.max(bubbleX + 18, Math.min(bubbleX + bubbleW - 18, centre)) - 8;
  const dim = 'rgba(0,0,0,0.72)';

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={skip}>
      <Pressable style={StyleSheet.absoluteFill} onPress={next} accessibilityLabel="Next tip">
        {/* the dimmed screen with a hole where the button is */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, hole.y), backgroundColor: dim }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: hole.y + hole.h, bottom: 0, backgroundColor: dim }} />
        <View style={{ position: 'absolute', left: 0, width: Math.max(0, hole.x), top: hole.y, height: hole.h, backgroundColor: dim }} />
        <View style={{ position: 'absolute', left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h, backgroundColor: dim }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: radius.md,
          borderWidth: 2, borderColor: colors.primary,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }} />

        {/* speech bubble with an arrow pointing at it */}
        <Animated.View style={{ position: 'absolute', left: bubbleX, width: bubbleW,
          ...(below ? { top: bubbleTop } : { bottom: sh - hole.y + 14 }),
          opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [below ? -8 : 8, 0] }) }] }}>
          {(!below || bubbleTop === hole.y + hole.h + 14) && (
            <View style={{ position: 'absolute', left: arrowX - bubbleX, width: 16, height: 16, backgroundColor: colors.surface, transform: [{ rotate: '45deg' }],
              ...(below ? { top: -7 } : { bottom: -7 }) }} />
          )}
          <Pressable onPress={(e) => e.stopPropagation()} onLayout={(e) => setBubbleH(Math.round(e.nativeEvent.layout.height))} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text style={{ fontSize: 22 }}>{step.emoji}</Text>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{step.title}</Text>
            </View>
            <Text variant="small" tone="muted">{step.body}</Text>
            {dots}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              {last ? <View /> : (
                <Pressable onPress={skip} hitSlop={10} accessibilityRole="button">
                  <Text variant="smallStrong" tone="muted">Skip</Text>
                </Pressable>
              )}
              <Button title={last ? finishLabel : 'Next'} size="sm" onPress={next} icon={last ? undefined : 'arrow-forward'} />
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
