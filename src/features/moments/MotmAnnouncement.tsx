import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Text } from '@/components/ui';
import { Confetti } from '@/components/football/Confetti';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useOnce } from './useOnce';

const native = Platform.OS !== 'web';
const GOLD = '#F5B014';

export interface MotmWinner { user_id: string; name: string; avatar: string | null; votes: number }

/**
 * "And the Man of the Match is…": a short drumroll, then the card flips to reveal the winner
 * with a gold burst. Shown once per game to everyone who opens it within a week of the result.
 */
export function MotmAnnouncement({ sessionId, finalisedAt, winners, userId, onDone }: {
  sessionId: string; finalisedAt: string | null; winners: MotmWinner[]; userId: string; onDone?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const recent = !!finalisedAt && now - new Date(finalisedAt).getTime() < 7 * 86400_000;
  const eligible = recent && winners.length > 0;
  const { due, markDone } = useOnce(eligible ? `matchday.motmReveal.${sessionId}` : null, eligible);
  if (!due) return null;
  return <Announcement winners={winners} isMe={winners.some((w) => w.user_id === userId)} onClose={() => { markDone(); onDone?.(); }} />;
}

function Announcement({ winners, isMe, onClose }: { winners: MotmWinner[]; isMe: boolean; onClose: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const [flip] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [revealed, setRevealed] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) { haptics.success(); return; }
    const drum = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 300, useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: 300, useNativeDriver: native }),
    ]));
    drum.start();
    const t = setTimeout(() => {
      drum.stop();
      Animated.timing(flip, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }).start();
      setTimeout(() => { setRevealed(true); haptics.goal(); }, 350);
    }, 1500);
    return () => { clearTimeout(t); drum.stop(); };
  }, [flip, pulse, reduceMotion]);

  // front (question mark) turns away, back (winner) turns in
  const frontRot = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] });
  const backRot = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] });
  const shared = winners.length > 1;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      {revealed && !reduceMotion && <Confetti colour={GOLD} />}
      <View style={styles.centre} pointerEvents="box-none">
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: `${GOLD}66` }]}>
          <Text variant="overline" style={{ color: GOLD }}>Full time</Text>
          <Text variant="h2" align="center" accessibilityRole="header">{shared ? 'And the Men of the Match are…' : 'And the Man of the Match is…'}</Text>
          <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[styles.face, { borderColor: colors.border, backgroundColor: colors.surfaceAlt,
              transform: [{ perspective: 800 }, { rotateY: frontRot }, { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
              <Text style={{ fontSize: 72, lineHeight: 80, fontWeight: '800', color: colors.textFaint }}>?</Text>
            </Animated.View>
            <Animated.View style={[styles.face, { borderColor: GOLD, backgroundColor: `${GOLD}14`, transform: [{ perspective: 800 }, { rotateY: backRot }] }]}
              accessible accessibilityLabel={`Man of the Match: ${winners.map((w) => w.name).join(' and ')}`}>
              <View style={{ flexDirection: 'row' }}>
                {winners.slice(0, 3).map((w, i) => (
                  <View key={w.user_id} style={{ marginLeft: i ? -12 : 0 }}><Avatar uri={w.avatar} name={w.name} size={shared ? 64 : 92} ring={GOLD} /></View>
                ))}
              </View>
              <Ionicons name="star" size={22} color={GOLD} style={{ marginTop: space.sm }} />
              <Text variant="h3" align="center" numberOfLines={2}>{winners.map((w) => w.name).join(' & ')}</Text>
              <Text variant="caption" tone="muted">{winners[0].votes} vote{winners[0].votes === 1 ? '' : 's'}{shared ? ' each' : ''}</Text>
            </Animated.View>
          </View>
          {revealed && isMe && <Text variant="bodyStrong" style={{ color: GOLD }}>That’s you! 🎉</Text>}
          <Button title={revealed ? 'Nice' : 'Skip'} variant={revealed ? 'primary' : 'ghost'} style={{ alignSelf: 'stretch' }} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 400, borderRadius: radius.xl, borderWidth: 1, padding: space.xl, gap: space.md, alignItems: 'center' },
  face: { position: 'absolute', width: 220, height: 220, borderRadius: radius.xl, borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: space.md, gap: 4, backfaceVisibility: 'hidden' },
});
