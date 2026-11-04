import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

const native = Platform.OS !== 'web';

const PIECES = 26;
const PALETTE = ['#22C55E', '#F5F7FA', '#F5B014'];

/** A short burst of confetti falling from the top, once. */
export function Confetti({ colour }: { colour: string }) {
  const { width, height } = useWindowDimensions();
  const [fall] = useState(() => new Animated.Value(0));
  const [pieces] = useState(() => Array.from({ length: PIECES }, (_, i) => ({
    x: Math.random(), drift: (Math.random() - 0.5) * 120, delay: Math.random() * 0.25, spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
    w: 6 + Math.random() * 5, h: 10 + Math.random() * 6, colour: i % 4 === 0 ? colour : PALETTE[i % PALETTE.length],
  })));
  useEffect(() => {
    Animated.timing(fall, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
  }, [fall]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const start = p.delay;
        const t = fall.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: p.x * width, top: -20, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.colour,
            opacity: t.interpolate({ inputRange: [0, 0.05, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.85] }) },
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }} />
        );
      })}
    </View>
  );
}

