import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, type HostInstance } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Avatar, Button, Segmented, SectionTitle, Text } from '@/components/ui';
import { rpc } from '@/lib/api';
import { shareViewAsImage } from '@/lib/share';
import { MIN_RATED_GAMES, monthLabel, monthStart, pickTeamOfMonth, type MonthCandidate, type Picked } from '@/domain/teamOfMonth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const native = Platform.OS !== 'web';
// where each slot sits on the pitch (% across, % down): keeper at the bottom, attackers at the top
const SPOT: Record<number, [number, number]> = { 0: [50, 82], 1: [26, 56], 2: [74, 56], 3: [30, 22], 4: [70, 22] };

/** The best five from a group's month on a pitch, with the Player of the Month as captain. Shareable. */
export function TeamOfMonth({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [offset, setOffset] = useState<'0' | '-1'>('0');
  const month = monthStart(Number(offset));
  const ref = useRef<HostInstance>(null);
  const q = useQuery({
    queryKey: ['team-of-month', groupId, month],
    queryFn: () => rpc<{ sessions: number; players: MonthCandidate[] }>('get_month_candidates', { p_group: groupId, p_month: month }),
  });
  const team = q.data ? pickTeamOfMonth(q.data.players) : null;
  const label = monthLabel(new Date(`${month}T12:00:00Z`));
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle title="Team of the Month" />
      <Segmented value={offset} onChange={setOffset} options={[{ value: '0', label: 'This month' }, { value: '-1', label: 'Last month' }]} />
      {!!q.data && !team && (
        <Text variant="small" tone="muted">
          Not enough yet for {label}: it needs 5 players with {MIN_RATED_GAMES}+ rated games{q.data.sessions ? ` (${q.data.sessions} game${q.data.sessions === 1 ? '' : 's'} played so far)` : ''}.
        </Text>
      )}
      {!!team && (
        <>
          <View ref={ref} collapsable={false} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0E3B22' }}>
            <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
              <Defs><LinearGradient id="tm" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#14532D" /><Stop offset="1" stopColor="#0C3A20" /></LinearGradient></Defs>
              <Rect width="100%" height="100%" fill="url(#tm)" />
              {[0, 1, 2, 3, 4, 5].map((i) => <Rect key={i} x="0" y={`${i * 18 + 9}%`} width="100%" height="9%" fill="rgba(255,255,255,0.025)" />)}
              <Line x1="0" y1="40%" x2="100%" y2="40%" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
              <Circle cx="50%" cy="40%" r="11%" stroke="rgba(255,255,255,0.18)" strokeWidth={2} fill="none" />
              <Rect x="30%" y="86%" width="40%" height="16%" stroke="rgba(255,255,255,0.18)" strokeWidth={2} fill="none" />
            </Svg>
            <View style={{ padding: space.lg, paddingBottom: space.md }}>
              <Text variant="overline" color="#86EFAC">Team of the Month · {label}</Text>
              <Text variant="h3" color="#F4F6F8" numberOfLines={1}>{groupName}</Text>
            </View>
            <View style={{ height: 330 }}>
              {team.players.map((p, i) => (
                <Token key={p.player.user_id} p={p} index={i} captain={p.player.user_id === team.captain.user_id} spot={SPOT[i]} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.md }}>
              <Text variant="caption" color="#BBF7D0">C = Player of the Month</Text>
              <Text variant="overline" color="#22C55E">MATCHDAY</Text>
            </View>
          </View>
          <Button title="Share team" icon="share-social-outline" variant="secondary" size="sm"
            onPress={() => shareViewAsImage(ref, `matchday-team-of-the-month-${month}`,
              `${groupName} Team of the Month (${label}): ${team.players.map((p) => p.player.display_name).join(', ')}. Player of the Month: ${team.captain.display_name}`).catch(() => undefined)} />
        </>
      )}
      {!!q.error && <Text variant="small" tone="muted">Couldn’t load the Team of the Month.</Text>}
    </View>
  );
}

function Token({ p, index, captain, spot }: { p: Picked; index: number; captain: boolean; spot: [number, number] }) {
  const { reduceMotion } = useTheme();
  const [enter] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(enter, { toValue: 1, duration: 420, delay: 90 * index, easing: Easing.out(Easing.back(1.5)), useNativeDriver: native }).start();
  }, [enter, index, reduceMotion]);
  return (
    <Animated.View style={{
      position: 'absolute', left: `${spot[0]}%`, top: `${spot[1]}%`, width: 110, marginLeft: -55, marginTop: -40, alignItems: 'center', gap: 2,
      opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
    }} accessible accessibilityLabel={`${p.slot === 'GK' ? 'Goalkeeper' : p.slot === 'DEF' ? 'Defender' : 'Attacker'}: ${p.player.display_name}, rating ${p.rating.toFixed(1)}${captain ? ', Player of the Month' : ''}`}>
      <View>
        <Avatar uri={p.player.avatar_url} name={p.player.display_name} size={48} ring={captain ? '#F5B014' : '#F4F6F8'} />
        {captain && (
          <View style={{ position: 'absolute', right: -6, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#F5B014', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: '800', color: '#111' }}>C</Text>
          </View>
        )}
      </View>
      <Text variant="smallStrong" color="#F4F6F8" numberOfLines={1}>{p.player.display_name.split(' ')[0]}</Text>
      <View style={{ paddingHorizontal: 6, borderRadius: 6, backgroundColor: captain ? '#F5B014' : 'rgba(0,0,0,0.35)' }}>
        <Text variant="caption" color={captain ? '#111' : '#F4F6F8'} style={{ fontWeight: '700' }}>{p.rating.toFixed(1)}</Text>
      </View>
    </Animated.View>
  );
}
