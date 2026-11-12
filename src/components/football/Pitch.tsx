/**
 * Tactical pitch with drag-and-drop line-ups.
 * Drag a player between Team A (top half), Team B (bottom half) and the bench, or tap a
 * player for precise actions (swap, goalkeeper, substitute, move). Works on touch, mouse
 * and with screen readers (tap → action sheet).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, View, type HostInstance, type LayoutRectangle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import type { PlayerPosition, PaymentStatus } from '@/types/db';
import { PaymentBadge } from './PaymentBadge';
import { SeasonPip } from './SeasonBadge';
import { arrangeOutfield, type Slot, type LineupState, type Zone } from '@/domain/lineup';

export type { Slot, LineupState, Zone } from '@/domain/lineup';


export interface LineupPlayer {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  position: PlayerPosition;
  /** Guest without an account (id is `guest:<uuid>`). */
  isGuest?: boolean;
}


export { formationRows } from '@/domain/lineup';

interface TokenProps {
  player: LineupPlayer;
  slot?: Slot;
  colour: string;
  payment?: PaymentStatus;
  showPayment?: boolean;
  /** the player's season badge, shown as a rank pip */
  season?: string | null;
  selected?: boolean;
  editable: boolean;
  onTap: () => void;
  onDrop: (x: number, y: number) => void;
  onDragState?: (dragging: boolean) => void;
  size?: number;
  /** Average rating (group, else career); null = no ratings yet. undefined = don't show. */
  rating?: number | null;
}

const POS_SHORT: Record<string, string> = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD', ANY: 'ANY' };

function Token({ player, slot, colour, payment, showPayment, season, selected, editable, onTap, onDrop, onDragState, size = 44, rating }: TokenProps) {
  const { colors } = useTheme();
  const [pan] = useState(() => new Animated.ValueXY());
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  // `dragging` is only read inside gesture callbacks, never during render.
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => editable && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderTerminationRequest: () => !dragging.current,
        onPanResponderMove: (_, g) => {
          if (!editable) return;
          if (!dragging.current && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4)) {
            dragging.current = true;
            setIsDragging(true);
            onDragState?.(true);
          }
          if (dragging.current) pan.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: (_, g) => {
          if (dragging.current) {
            dragging.current = false;
            setIsDragging(false);
            onDragState?.(false);
            onDrop(g.moveX, g.moveY);
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: Platform.OS !== 'web', speed: 30 }).start();
          } else {
            onTap();
          }
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          setIsDragging(false);
          onDragState?.(false);
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [editable, onTap, onDrop, onDragState, pan],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${player.display_name}${slot?.is_goalkeeper ? ', goalkeeper' : ''}${slot?.is_substitute ? ', substitute' : ''}`}
      accessibilityHint={editable ? 'Opens player options' : undefined}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onTap}
      style={{ alignItems: 'center', width: size + 28, transform: pan.getTranslateTransform(), zIndex: isDragging ? 10 : 1, cursor: editable ? 'grab' : 'pointer' } as any}
    >
      <View>
        <Avatar uri={player.avatar_url} name={player.display_name} size={size} ring={selected ? colors.warning : colour} />
        <SeasonPip code={season} avatar={size} />
        {!!(slot?.is_goalkeeper) && (
          <View style={{ position: 'absolute', top: -4, left: -4, backgroundColor: colors.warning, borderRadius: 8, paddingHorizontal: 4 }}>
            <Text variant="caption" color="#111" style={{ fontSize: 9, lineHeight: 13 }}>GK</Text>
          </View>
        )}
        {!!showPayment && (
          <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.surface, borderRadius: 9 }}>
            <PaymentBadge status={payment} size={16} />
          </View>
        )}
      </View>
      <View style={{ marginTop: 3, paddingHorizontal: 5, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)', maxWidth: size + 28 }}>
        <Text variant="caption" color="#fff" numberOfLines={1} style={{ fontSize: 11 }}>
          {slot?.is_substitute ? '↺ ' : ''}{player.username}
        </Text>
      </View>
      {(() => {
        // position on this line-up (falls back to the player's preferred position) + average rating
        const pos = slot?.is_goalkeeper ? 'GK' : slot && slot.position !== 'ANY' ? slot.position : player.position;
        const parts = [
          player.isGuest ? 'guest' : null,
          pos && pos !== 'ANY' ? POS_SHORT[pos] : null,
          player.isGuest || rating === undefined ? null : rating == null ? 'new' : `★ ${rating.toFixed(1)}`,
        ].filter(Boolean);
        if (!parts.length) return null;
        return (
          <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ fontSize: 10, lineHeight: 13, marginTop: 1 }}>
            {parts.join(' · ')}
          </Text>
        );
      })()}
    </Animated.View>
  );
}

export interface PitchProps {
  players: Record<string, LineupPlayer>;
  lineup: LineupState;
  bench: string[];
  editable: boolean;
  teamNames?: { A: string; B: string };
  teamColours?: { A: string; B: string };
  payments?: Record<string, PaymentStatus>;
  /** each player's season badge (for the rank pips) */
  seasons?: Record<string, string>;
  showPayments?: boolean;
  /** Average rating per player id (group rating, else career). */
  ratings?: Record<string, number | null>;
  /** Players who never pay (e.g. the host) — no payment badge. */
  exemptFromPayment?: string | null;
  selected?: string | null;
  onTapPlayer?: (userId: string) => void;
  onMove?: (userId: string, to: Zone) => void;
  onDragState?: (dragging: boolean) => void;
}

export function Pitch({ players, lineup, bench, editable, teamNames, teamColours, payments, seasons, showPayments, exemptFromPayment, ratings, selected, onTapPlayer, onMove, onDragState }: PitchProps) {
  const { colors } = useTheme();
  const zones = useRef<Record<Zone, LayoutRectangle | null>>({ A: null, B: null, bench: null });
  const refA = useRef<HostInstance>(null);
  const refB = useRef<HostInstance>(null);
  const refBench = useRef<HostInstance>(null);
  const measure = (z: Zone) => {
    const node = z === 'A' ? refA.current : z === 'B' ? refB.current : refBench.current;
    node?.measureInWindow((x, y, width, height) => (zones.current[z] = { x, y, width, height }));
  };

  const handleDragState = (d: boolean) => {
    if (d) (['A', 'B', 'bench'] as Zone[]).forEach(measure); // refresh zone rects when a drag starts
    onDragState?.(d);
  };
  const dropAt = (userId: string) => (x: number, y: number) => {
    const hit = (['A', 'B', 'bench'] as Zone[]).find((z) => {
      const r = zones.current[z];
      return r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    });
    if (hit) onMove?.(userId, hit);
  };

  const colourA = teamColours?.A ?? colors.teamA;
  const colourB = teamColours?.B ?? colors.teamB;

  const renderSide = (side: 'A' | 'B') => {
    const slots = lineup[side];
    const starters = slots.filter((s) => !s.is_substitute);
    const subs = slots.filter((s) => s.is_substitute);
    const gk = starters.filter((s) => s.is_goalkeeper);
    const outfield = starters.filter((s) => !s.is_goalkeeper);
    const outfieldRows = arrangeOutfield(outfield);
    const ordered = side === 'A' ? [gk, ...outfieldRows] : [...outfieldRows.reverse(), gk];
    const colour = side === 'A' ? colourA : colourB;
    return (
      <View
        ref={side === 'A' ? refA : refB}
        onLayout={() => measure(side)}
        style={{ flex: 1, justifyContent: 'space-evenly', paddingVertical: space.sm, minHeight: 210 }}
      >
        {slots.length === 0 && (
          <Text variant="small" color="rgba(255,255,255,0.6)" align="center">
            {editable ? `Drag players here for ${side === 'A' ? teamNames?.A ?? 'Team A' : teamNames?.B ?? 'Team B'}` : 'No players yet'}
          </Text>
        )}
        {ordered.map((row, i) =>
          row.length ? (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
              {row.map((s) => players[s.user_id] && (
                <Token key={s.user_id} player={players[s.user_id]} slot={s} colour={colour} season={seasons?.[s.user_id]} payment={payments?.[s.user_id]} showPayment={!!showPayments && s.user_id !== exemptFromPayment && !players[s.user_id]?.isGuest}
                  rating={ratings ? ratings[s.user_id] ?? null : undefined} selected={selected === s.user_id} editable={editable} onTap={() => onTapPlayer?.(s.user_id)} onDrop={dropAt(s.user_id)} onDragState={handleDragState} />
              ))}
            </View>
          ) : null,
        )}
        {subs.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm, opacity: 0.85 }}>
            {subs.map((s) => players[s.user_id] && (
              <Token key={s.user_id} size={34} player={players[s.user_id]} slot={s} colour={colour} season={seasons?.[s.user_id]} payment={payments?.[s.user_id]} showPayment={!!showPayments && s.user_id !== exemptFromPayment && !players[s.user_id]?.isGuest}
                rating={ratings ? ratings[s.user_id] ?? null : undefined} selected={selected === s.user_id} editable={editable} onTap={() => onTapPlayer?.(s.user_id)} onDrop={dropAt(s.user_id)} onDragState={handleDragState} />
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.pitch }}>
        <Svg style={{ position: 'absolute', width: '100%', height: '100%' }} viewBox="0 0 100 160" preserveAspectRatio="none">
          {Array.from({ length: 8 }).map((_, i) => (
            <Rect key={i} x={0} y={i * 20} width={100} height={10} fill={colors.pitchStripe} />
          ))}
          <Rect x={4} y={4} width={92} height={152} stroke={colors.pitchLine} strokeWidth={0.6} fill="none" />
          <Line x1={4} y1={80} x2={96} y2={80} stroke={colors.pitchLine} strokeWidth={0.6} />
          <Circle cx={50} cy={80} r={12} stroke={colors.pitchLine} strokeWidth={0.6} fill="none" />
          <Rect x={28} y={4} width={44} height={18} stroke={colors.pitchLine} strokeWidth={0.6} fill="none" />
          <Rect x={28} y={138} width={44} height={18} stroke={colors.pitchLine} strokeWidth={0.6} fill="none" />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.md, paddingTop: space.sm }}>
          <Text variant="overline" color={colourA}>{teamNames?.A ?? 'Team A'} · {lineup.A.length}</Text>
        </View>
        {renderSide('A')}
        <View style={{ height: space.lg }} />
        {renderSide('B')}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.md, paddingBottom: space.sm }}>
          <Text variant="overline" color={colourB}>{teamNames?.B ?? 'Team B'} · {lineup.B.length}</Text>
        </View>
      </View>
      {(editable || bench.length > 0) && (
        <View
          ref={refBench}
          onLayout={() => measure('bench')}
          style={{ borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, padding: space.md, gap: space.sm, minHeight: 92 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="people-outline" size={14} color={colors.textMuted} />
            <Text variant="overline" tone="muted">Unassigned · {bench.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {bench.map((id) => players[id] && (
              <Token key={id} size={38} player={players[id]} colour={colors.borderStrong} season={seasons?.[id]} payment={payments?.[id]} showPayment={!!showPayments && id !== exemptFromPayment && !players[id]?.isGuest}
                rating={ratings ? ratings[id] ?? null : undefined} selected={selected === id} editable={editable} onTap={() => onTapPlayer?.(id)} onDrop={dropAt(id)} onDragState={handleDragState} />
            ))}
            {bench.length === 0 && <Text variant="small" tone="faint">Everyone has been picked.</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

export { lineupOps } from '@/domain/lineup';
