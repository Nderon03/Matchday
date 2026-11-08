import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StadiumHero } from '@/features/AuthShell';
import { Text } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';
const PITCH = '#22C55E';

export interface MatchdayGame {
  name: string;
  starts_at: string;
  duration_minutes?: number | null;
  venue?: string | null;
  location?: string | null;
  format_size?: number;
  confirmed?: number;
  max_attendance?: number;
  status?: string;
}

/** Is this game today (local time)? Then the app switches into matchday mode for it. */
export function isMatchday(startsAt: string, now: number) {
  const d = new Date(startsAt);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Matchday mode: on the day of a game, a floodlit header with the countdown to kick-off,
 * then LIVE while it's being played, then FULL TIME.
 */
export function MatchdayHero({ game, onPress, children }: { game: MatchdayGame; onPress?: () => void; children?: React.ReactNode }) {
  const { colors, reduceMotion } = useTheme();
  const now = useNow(1000);
  const [w, setW] = useState(0);
  const [pulse] = useState(() => new Animated.Value(0));
  const start = new Date(game.starts_at).getTime();
  const end = start + (game.duration_minutes ?? 60) * 60_000;
  const phase = game.status === 'completed' || game.status === 'finalised' || now >= end ? 'ft' : now >= start ? 'live' : 'pre';

  useEffect(() => {
    if (phase !== 'live' || reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase, pulse, reduceMotion]);

  const left = Math.max(0, start - now);
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const kick = new Date(game.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const minutesIn = Math.floor((now - start) / 60_000);
  const place = [game.venue, game.location].filter(Boolean).join(' · ');
  const label = phase === 'pre' ? `Matchday. ${game.name} kicks off at ${kick}, in ${h} hours ${m} minutes.`
    : phase === 'live' ? `${game.name} is live, ${minutesIn} minutes in.` : `Full time at ${game.name}.`;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#06140C', borderWidth: 1, borderColor: `${PITCH}55` }}>
      {w > 0 && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <StadiumHero height={190} width={w} fadeTo="#06140C" ball={false} />
        </View>
      )}
      {/* only the scoreboard is tappable: buttons passed as children sit outside it (no button inside a button on web) */}
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}
        style={({ pressed }) => ({ padding: space.lg, paddingBottom: children ? space.sm : space.lg, gap: space.sm, minHeight: children ? 170 : 190, justifyContent: 'flex-end', opacity: pressed ? 0.92 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {phase === 'live' ? (
            <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }} />
          ) : <Ionicons name={phase === 'ft' ? 'flag' : 'football'} size={13} color={PITCH} />}
          <Text style={{ color: phase === 'live' ? '#FCA5A5' : PITCH, fontFamily: fonts.score, fontSize: 15, letterSpacing: 3 }}>
            {phase === 'pre' ? 'MATCHDAY' : phase === 'live' ? 'LIVE' : 'FULL TIME'}
          </Text>
          {!!game.format_size && <Text variant="caption" color="#9FB3A8">· {game.format_size}-A-SIDE</Text>}
        </View>
        {phase === 'pre' ? (
          <View>
            <Text variant="caption" color="#9FB3A8" style={{ letterSpacing: 1.5 }}>KICK-OFF IN</Text>
            <Text style={{ color: '#F4F6F8', fontFamily: fonts.scoreHeavy, fontSize: 48, lineHeight: 52, letterSpacing: 1, fontVariant: ['tabular-nums'] }}>
              {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
            </Text>
          </View>
        ) : (
          <Text style={{ color: '#F4F6F8', fontFamily: fonts.scoreHeavy, fontSize: 34, lineHeight: 38, letterSpacing: 0.5 }}>
            {phase === 'live' ? `${Math.max(1, minutesIn)}′ ON THE CLOCK` : 'FULL TIME'}
          </Text>
        )}
        <Text variant="h3" color="#F4F6F8" numberOfLines={1}>{game.name}</Text>
        <Text variant="small" color="#B6C7BD" numberOfLines={1}>
          {kick}{place ? ` · ${place}` : ''}{game.max_attendance ? ` · ${game.confirmed ?? 0}/${game.max_attendance} in` : ''}
        </Text>
      </Pressable>
      {!!children && <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs }}>{children}</View>}
    </View>
  );
}
