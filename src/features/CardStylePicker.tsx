import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Chip, Row, Text, useToast } from '@/components/ui';
import { AchievementBadge } from '@/components/football/AchievementBadge';
import { CARD_TITLES, cardTitle, titleUnlocked } from '@/domain/titles';
import { CardFX } from '@/components/football/CardFX';
import { CardMedals, PERFECT_RELIABILITY_GAMES, PlayerCard, type PlayerCardData } from '@/components/football/PlayerCard';
import { CARD_STYLES, SEASON_CHAMPION, TRACKS, cardStyle, levelInfo, medalPoints, parseCode, type CardStyle } from '@/domain/achievements';
import { plural } from '@/domain/format';
import { keys, useMyAchievements, usePlayerProfile, type MyAchievement } from '@/hooks/queries';
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
    queryFn: () => q<{ card_style: string; nationality: string | null; supported_club: string | null; card_medals: string[]; card_title: string | null } | null>(
      supabase.from('profiles').select('card_style, nationality, supported_club, card_medals, card_title').eq('id', userId!).maybeSingle()),
  });
  const reliability = useReliability(userId ? [userId] : []);
  const d = profile.data;
  if (!d || !userId) return null;
  const unlocked = new Set<string>((d.achievements ?? []).map((a: { code: string }) => a.code));
  return {
    ...d.profile, stats: d.stats ?? null, achievements: medalPoints(unlocked),
    card_style: extra.data?.card_style, nationality: extra.data?.nationality, supported_club: extra.data?.supported_club,
    medals: extra.data?.card_medals ?? [],
    title: extra.data?.card_title ?? null,
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
  const [medals, setMedals] = useState<string[] | null>(null);
  // undefined = not touched; null = no title; otherwise previewing / using that title
  const [title, setTitle] = useState<string | null | undefined>(undefined);
  const shownTitle = title === undefined ? card?.title ?? null : title;
  const titleLockedPreview = !!title && !!mine.data && !!card && !titleUnlocked(cardTitle(title)!, {
    codes: new Set(mine.data.items.filter((i) => i.unlocked_at).map((i) => i.code)), points: mine.data.points,
    perfectlyReliable: card.reliability?.pct === 100 && (card.reliability?.attended ?? 0) >= PERFECT_RELIABILITY_GAMES,
  });
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
            <PlayerCard data={{ ...card, ...overrides, card_style: shown.id, medals: medals ?? card.medals, title: shownTitle }} />
          </View>
          {(locked || titleLockedPreview) && (
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
      {!!mine.data && !!card && (
        <TitleChooser value={shownTitle} saved={card.title ?? null} points={points}
          codes={new Set(mine.data.items.filter((i) => i.unlocked_at).map((i) => i.code))}
          perfectlyReliable={card.reliability?.pct === 100 && (card.reliability?.attended ?? 0) >= PERFECT_RELIABILITY_GAMES}
          onPreview={setTitle} />
      )}
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
      {!!mine.data && <MedalChooser items={mine.data.items} value={medals ?? card?.medals ?? []} onChange={setMedals} st={shown} />}
    </View>
  );
}

/**
 * Pick a title for under your name. Free ones and unlocked ones are applied as you tap; locked
 * ones show on your card as a preview with what it takes to unlock them.
 */
function TitleChooser({ value, saved, points, codes, perfectlyReliable, onPreview }: {
  value: string | null; saved: string | null; points: number; codes: Set<string>; perfectlyReliable: boolean;
  onPreview: (id: string | null) => void;
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [savedNow, setSavedNow] = useState(saved);
  const have = { codes, points, perfectlyReliable };
  const shown = cardTitle(value);
  const lockedShown = !!shown && !titleUnlocked(shown, have);
  const unlockedCount = CARD_TITLES.filter((t) => titleUnlocked(t, have)).length;

  const choose = async (id: string | null) => {
    onPreview(id);
    haptics.tap();
    const t = cardTitle(id);
    if ((t && !titleUnlocked(t, have)) || id === savedNow) return;
    const before = savedNow;
    setSavedNow(id);
    try {
      await rpc('set_card_title', { p_title: id });
      qc.invalidateQueries({ queryKey: ['player'] });
    } catch (e) {
      setSavedNow(before);
      onPreview(before);
      toast.error(e);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" tone="muted">Title · {unlockedCount}/{CARD_TITLES.length} unlocked</Text>
      {lockedShown && (
        <Row gap={6}>
          <Ionicons name="lock-closed" size={13} color={colors.warning} />
          <Text variant="caption" tone="warning" style={{ flex: 1 }}>Preview · to unlock “{shown!.label}”: {shown!.hint}</Text>
        </Row>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
        <Chip label="None" selected={!value} onPress={() => choose(null)} />
        {[...CARD_TITLES].sort((a, b) => Number(titleUnlocked(b, have)) - Number(titleUnlocked(a, have))).map((t) => {
          const open = titleUnlocked(t, have);
          return (
            <Chip key={t.id} label={t.label} selected={value === t.id} onPress={() => choose(t.id)}
              icon={open ? undefined : <Ionicons name="lock-closed" size={11} color={colors.textFaint} />} />
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Pick up to three earned medals to show along the bottom of your card, and which level of each
 * (your best, or a lower one if you prefer the colour). Saved as you tap.
 */
function MedalChooser({ items, value, onChange, st }: { items: MyAchievement[]; value: string[]; onChange: (v: string[]) => void; st: CardStyle }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const earned = items.filter((i) => i.unlocked_at);
  const tracks = [
    ...TRACKS.map((t) => ({ track: t.track, name: t.name, icon: t.icon, codes: earned.filter((i) => i.track === t.track).sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map((i) => i.code) })),
    { track: SEASON_CHAMPION.code, name: SEASON_CHAMPION.name, icon: SEASON_CHAMPION.icon, codes: earned.some((i) => i.code === SEASON_CHAMPION.code) ? [SEASON_CHAMPION.code] : [] },
  ].filter((t) => t.codes.length);

  const save = async (next: string[]) => {
    const before = value;
    onChange(next);
    haptics.tap();
    try {
      await rpc('set_card_medals', { p_codes: next });
      qc.invalidateQueries({ queryKey: ['player'] });
    } catch (e) {
      onChange(before);
      toast.error(e);
    }
  };
  const pick = (track: { codes: string[] }, code: string | null) => {
    const others = value.filter((c) => !track.codes.includes(c));
    if (code && others.length >= 3) return toast.show('Up to 3 medals on your card. Turn one off first.');
    // keep the order they were added in; a new medal goes on the end
    const at = value.findIndex((c) => track.codes.includes(c));
    const next = code ? (at >= 0 ? value.map((c, i) => (i === at ? code : c)) : [...value, code]) : others;
    save(next);
  };

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" tone="muted">Medals on your card · {value.length}/3</Text>
      {/* the bottom of your card, so you can see the medals while you pick them */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: space.lg,
        borderRadius: radius.md, borderWidth: 1, borderColor: st.border ?? colors.border, backgroundColor: st.to }}>
        <Text variant="overline" color={st.accent}>MATCHDAY</Text>
        {value.length ? <CardMedals codes={value} /> : <Text variant="caption" color={st.muted}>No medals shown</Text>}
      </View>
      {!tracks.length ? (
        <Text variant="caption" tone="faint">Earn your first medal (play a game, score, win MOTM) and you can show it off here.</Text>
      ) : tracks.map((t) => {
        const chosen = value.find((c) => t.codes.includes(c)) ?? null;
        return (
          <View key={t.track} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <AchievementBadge icon={t.icon} level={parseCode(chosen ?? t.codes[t.codes.length - 1]).level} size={30} animate={false} />
            <Text variant="smallStrong" style={{ width: 92 }} numberOfLines={2}>{t.name}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Chip label="Off" selected={!chosen} onPress={() => chosen && pick(t, null)} />
              {t.codes.map((c) => (
                <Chip key={c} label={t.track === SEASON_CHAMPION.code ? 'Show' : levelInfo(parseCode(c).level).label} selected={chosen === c} onPress={() => chosen !== c && pick(t, c)} />
              ))}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}
