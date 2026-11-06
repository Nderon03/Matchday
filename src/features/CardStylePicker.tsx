import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Row, Text, useToast } from '@/components/ui';
import { CardFX } from '@/components/football/CardFX';
import { PlayerCard, type PlayerCardData } from '@/components/football/PlayerCard';
import { CARD_STYLES, cardStyle, medalPoints, type CardStyle } from '@/domain/achievements';
import { plural } from '@/domain/format';
import { keys, useMyAchievements, usePlayerProfile } from '@/hooks/queries';
import { useReliability } from '@/features/Reliability';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { q, rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

function Tile({ s, selected, unlocked, points, onPress }: { s: CardStyle; selected: boolean; unlocked: boolean; points: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected, disabled: !unlocked }}
      accessibilityLabel={`${s.name} card${unlocked ? '' : `, needs ${plural(s.points, 'medal point')}`}`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: s.base ? 92 : 124, height: s.base ? 64 : 80, borderRadius: radius.md, overflow: 'hidden',
        borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : s.border ?? colors.border, opacity: unlocked ? 1 : 0.5 }}>
        <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
          <Defs>
            <LinearGradient id={`cs-${s.id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={s.from} />
              <Stop offset="1" stopColor={s.to} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#cs-${s.id})`} />
        </Svg>
        {unlocked && <CardFX st={s} radius={radius.md} />}
        <View style={{ flex: 1, padding: space.sm, justifyContent: 'space-between' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.accent }} />
            {!unlocked ? <Ionicons name="lock-closed" size={13} color={s.muted} /> : selected ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} /> : null}
          </Row>
          <View>
            <Text variant="caption" color={s.accent} style={{ fontWeight: '700' }} numberOfLines={1}>{s.name}</Text>
            {!s.base && <Text variant="caption" color={s.muted} style={{ fontSize: 10 }} numberOfLines={1}>{unlocked ? (selected ? 'In use' : 'Unlocked') : `${s.points - points} more points`}</Text>}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Your own card, as everyone else sees it (stats, medals, flag, club, reliability). */
export function useMyCardData(): PlayerCardData | null {
  const { userId } = useAuth();
  const profile = usePlayerProfile(userId ?? '');
  const extra = useQuery({
    queryKey: ['player', userId, 'card'], enabled: !!userId,
    queryFn: () => q<{ card_style: string; nationality: string | null; supported_club: string | null } | null>(
      supabase.from('profiles').select('card_style, nationality, supported_club').eq('id', userId!).maybeSingle()),
  });
  const reliability = useReliability(userId ? [userId] : []);
  const d = profile.data;
  if (!d || !userId) return null;
  const unlocked = new Set<string>((d.achievements ?? []).map((a: { code: string }) => a.code));
  return {
    ...d.profile, stats: d.stats ?? null, achievements: medalPoints(unlocked),
    card_style: extra.data?.card_style, nationality: extra.data?.nationality, supported_club: extra.data?.supported_club,
    reliability: reliability.data?.[userId] ?? null,
  };
}

/**
 * Your card on top, every style underneath. Tap a style to see it on your card straight away:
 * ones you've unlocked are applied, locked ones are a preview with how close you are.
 * `overrides` lets Edit profile show unsaved changes (name, photo, flag...) on the card live.
 */
export function CardStylePicker({ overrides, actions }: { overrides?: Partial<PlayerCardData>; actions?: React.ReactNode }) {
  const { colors } = useTheme();
  const mine = useMyAchievements();
  const card = useMyCardData();
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const points = mine.data?.points ?? 0;
  const current = picked ?? mine.data?.card_style ?? 'classic';
  const shown = cardStyle(preview ?? current);
  const locked = points < shown.points;

  const choose = async (s: CardStyle) => {
    setPreview(s.id);
    haptics.tap();
    if (points < s.points || s.id === current) return;
    const before = current;
    setPicked(s.id);
    try {
      await rpc('set_card_style', { p_style: s.id });
      if (s.fx >= 3) haptics.success();
      qc.invalidateQueries({ queryKey: keys.myAchievements });
      qc.invalidateQueries({ queryKey: ['player'] });
    } catch (e) {
      setPicked(before);
      toast.error(e);
    }
  };

  const row = (list: CardStyle[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
      {list.map((s) => <Tile key={s.id} s={s} points={points} selected={(preview ?? current) === s.id} unlocked={points >= s.points} onPress={() => choose(s)} />)}
    </ScrollView>
  );
  return (
    <View style={{ gap: space.md }}>
      {card ? (
        <View>
          <View style={{ opacity: locked ? 0.92 : 1 }}>
            <PlayerCard data={{ ...card, ...overrides, card_style: shown.id }} />
          </View>
          {locked && (
            <View style={{ position: 'absolute', top: space.sm, right: space.sm, flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)' }}>
              <Ionicons name="lock-closed" size={11} color="#FFFFFF" />
              <Text variant="caption" color="#FFFFFF" style={{ fontWeight: '700' }}>Preview</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={{ height: 230, borderRadius: radius.xl, backgroundColor: colors.surfaceAlt }} />
      )}
      {actions}
      {locked ? (
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="smallStrong">{shown.name} unlocks at {plural(shown.points, 'medal point')}</Text>
            <Text variant="caption" tone="muted">{points} / {shown.points}</Text>
          </Row>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (points / shown.points) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: shown.accent }} />
          </View>
          <Text variant="caption" tone="muted">
            {plural(shown.points - points, 'more point')} to go. Level up medals (games, goals, MOTM, streaks) to earn them.
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="muted" align="center">{shown.name} · in use{shown.fx ? '' : ' · earn medals to unlock animated cards'}</Text>
      )}
      <Text variant="caption" tone="muted">Colours</Text>
      {row(CARD_STYLES.filter((s) => s.base))}
      <Text variant="caption" tone="muted">Earned with medals · you have {plural(points, 'point')}</Text>
      {row(CARD_STYLES.filter((s) => !s.base))}
    </View>
  );
}
