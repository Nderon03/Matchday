import React, { useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Avatar, Button, ErrorState, Header, Loading, Row, Screen, SwipeSelect, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { shareViewAsImage } from '@/lib/share';
import { useAuth } from '@/providers/AuthProvider';
import { rating, plural } from '@/domain/format';
import { parseSeasonBadge, seasonNumber } from '@/domain/seasonBadges';
import { fonts, radius, space } from '@/theme/tokens';
import { ScreenHelp } from '@/features/ScreenHelp';
import { ShareFrame } from '@/components/football/ShareFrame';
import { SeasonEmblem } from '@/components/football/SeasonBadge';

const QUARTER_NAMES = ['Winter', 'Spring', 'Summer', 'Autumn'];
/** The first season there is: Pre-season (Autumn 2026). */
const FIRST_QUARTER = new Date(2026, 9, 1);

type Period = { key: string; label: string; from: Date; to: Date; quarter?: string };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

function periods(): Period[] {
  const now = new Date();
  const list: Period[] = [];
  // seasons first (this one and the last few), then months and years
  for (let i = 0; i < 4; i++) {
    const from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - i * 3, 1);
    if (from < FIRST_QUARTER) break;
    const n = seasonNumber(iso(from));
    const name = `${QUARTER_NAMES[from.getMonth() / 3]} ${from.getFullYear()}`;
    list.push({ key: `q${iso(from)}`, label: n === 0 ? `Pre-season (${name})` : `Season ${n} (${name})`, from, to: new Date(from.getFullYear(), from.getMonth() + 3, 1), quarter: iso(from) });
  }
  for (let i = 0; i < 6; i++) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    list.push({ key: `m${i}`, label: from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), from, to });
  }
  list.push({ key: 'y0', label: `${now.getFullYear()}`, from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) });
  list.push({ key: 'y1', label: `${now.getFullYear() - 1}`, from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear(), 0, 1) });
  return list;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function Big({ value, label, muted = '#9FB3A8' }: { value: string | number; label: string; muted?: string }) {
  return (
    <View style={{ width: '33.33%', paddingVertical: space.sm }}>
      <Text variant="statSmall" color="#F4F6F8" numberOfLines={1}>{value}</Text>
      <Text variant="caption" color={muted} numberOfLines={1}>{label}</Text>
    </View>
  );
}

interface Race { group_id: string; group_name: string; finished: boolean; rank: number | null; of: number; score: number | null; eligible: boolean; apps: number; games: number }

export default function Wrapped() {
  const { profile } = useAuth();
  const toast = useToast();
  const { season } = useLocalSearchParams<{ season?: string }>();
  const ps = periods();
  const [key, setKey] = useState(() => (season && ps.some((x) => x.key === `q${season}`) ? `q${season}` : ps[0].key));
  const p = ps.find((x) => x.key === key) ?? ps[0];
  const ref = useRef<HostInstance>(null);
  const w = useQuery({
    queryKey: ['wrapped', key],
    queryFn: () => (p.quarter ? rpc<any>('get_season_wrapped', { p_quarter: p.quarter }) : rpc<any>('get_wrapped', { p_from: p.from.toISOString(), p_to: p.to.toISOString() })),
  });
  const d = w.data;
  const badge = parseSeasonBadge(d?.badge);
  const share = () => {
    if (!d) return;
    const races: Race[] = d.races ?? [];
    const best = races.find((r) => r.rank);
    const text = p.quarter
      ? `My MATCHDAY ${d.season_label} (${d.season_name}): ${badge ? `${badge.label}, ` : ''}${best ? `${ordinal(best.rank!)} of ${best.of} in ${best.group_name}, ` : ''}${plural(d.sessions, 'game')}, ${plural(d.goals, 'goal')}, ${d.motm} MOTM`
      : `My MATCHDAY ${p.label}: ${plural(d.sessions, 'game')}, ${plural(d.goals, 'goal')}, ${d.motm} MOTM`;
    shareViewAsImage(ref, `matchday-wrapped-${key}`, text).catch(toast.error);
  };
  return (
    <Screen edges={['top', 'bottom']} maxWidth={560}>
      <Header title="MATCHDAY Wrapped" right={<ScreenHelp id="wrapped" />} />
      <SwipeSelect accessibilityLabel="Period" value={key} onChange={setKey} options={ps.map((x) => ({ value: x.key, label: x.label }))} />
      {!!w.isLoading && <Loading />}
      {!!w.error && <ErrorState error={w.error} onRetry={w.refetch} />}
      {!!d && (
        <>
          <ShareFrame ref={ref} label={p.quarter ? 'Season Wrapped' : 'Wrapped'}>
            {p.quarter ? <SeasonCard d={d} name={profile?.display_name} avatar={profile?.avatar_url} /> : <PeriodCard d={d} label={p.label} name={profile?.display_name} avatar={profile?.avatar_url} />}
          </ShareFrame>
          {d.sessions > 0 && <Button title="Share" icon="share-social-outline" onPress={share} />}
        </>
      )}
    </Screen>
  );
}

/** Months and years: the original Wrapped. */
function PeriodCard({ d, label, name, avatar }: { d: any; label: string; name?: string; avatar?: string | null }) {
  return (
    <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0B1410' }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs><LinearGradient id="w" x1="0" y1="0" x2="0.4" y2="1"><Stop offset="0" stopColor="#15532F" /><Stop offset="1" stopColor="#090D0B" /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#w)" />
      </Svg>
      <View style={{ padding: space.xl, gap: space.md }}>
        <Row gap={space.md}>
          <Avatar uri={avatar} name={name} size={48} ring="#22C55E" />
          <View style={{ flex: 1 }}>
            <Text variant="overline" color="#22C55E">MATCHDAY WRAPPED</Text>
            <Text variant="h2" color="#F4F6F8">{label}</Text>
          </View>
        </Row>
        {d.sessions === 0 ? (
          <Text color="#9FB3A8">No verified games in this period. Get out there!</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Big value={d.sessions} label="Games" />
              <Big value={d.goals} label="Goals" />
              <Big value={d.assists} label="Assists" />
              <Big value={`${d.wins}-${d.draws}-${d.losses}`} label="W · D · L" />
              <Big value={rating(d.rating)} label="Avg rating" />
              <Big value={d.motm} label="MOTM" />
            </View>
            <Extras d={d} colour="#C9D6CF" />
          </>
        )}
        <Text variant="caption" color="#6F8378">Your football. Your squad. Your statistics.</Text>
      </View>
    </View>
  );
}

function Extras({ d, colour }: { d: any; colour: string }) {
  return (
    <View style={{ gap: 4 }}>
      {!!d.best_win_streak && d.best_win_streak > 1 && <Text variant="small" color={colour}>Longest win streak: {d.best_win_streak}</Text>}
      {!!d.best_performance && (
        <Text variant="small" color={colour}>Best game: {d.best_performance.name}{d.best_performance.rating ? ` (${rating(d.best_performance.rating)})` : ''}{d.best_performance.goals ? ` · ${plural(d.best_performance.goals, 'goal')}` : ''}</Text>
      )}
      {d.teammates?.length > 0 && <Text variant="small" color={colour}>Most games with: {d.teammates.map((t: any) => t.display_name).join(', ')}</Text>}
    </View>
  );
}

/** A season: your ranked title, where you finished in each race, and your numbers, in your tier's colours. */
function SeasonCard({ d, name, avatar }: { d: any; name?: string; avatar?: string | null }) {
  const badge = parseSeasonBadge(d.badge);
  const accent = badge?.info.colour ?? '#F5C542';
  const fill = badge?.info.fill ?? '#1F2937';
  const races: Race[] = d.races ?? [];
  const running = races.some((r) => !r.finished) || (!races.length && new Date(`${d.ends_on}T23:59:59`) > new Date());
  return (
    <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#07080B' }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Defs>
          <LinearGradient id="sw" x1="0" y1="0" x2="0.3" y2="1"><Stop offset="0" stopColor={fill} /><Stop offset="0.75" stopColor="#07080B" /></LinearGradient>
          <RadialGradient id="swg" cx="50%" cy="18%" r="55%"><Stop offset="0" stopColor={accent} stopOpacity="0.22" /><Stop offset="1" stopColor={accent} stopOpacity="0" /></RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sw)" />
        <Rect width="100%" height="100%" fill="url(#swg)" />
      </Svg>
      <View style={{ padding: space.xl, gap: space.lg, alignItems: 'center' }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: fonts.score, fontSize: 28, lineHeight: 32, letterSpacing: 3, color: accent }}>{String(d.season_label).toUpperCase()}</Text>
          <Text variant="small" color="#C9CED6">{d.season_name}{running ? ' · so far' : ''}</Text>
        </View>
        <Row gap={space.sm}>
          <Avatar uri={avatar} name={name} size={36} ring={accent} />
          <Text variant="bodyStrong" color="#F4F6F8">{name}</Text>
        </Row>
        {badge ? (
          <View style={{ alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={`Ranked title: ${badge.label}`}>
            <SeasonEmblem code={badge.code} size={84} />
            <Text style={{ fontFamily: fonts.scoreHeavy, fontSize: 30, lineHeight: 34, color: accent }}>{badge.label.toUpperCase()}</Text>
            <Text variant="caption" color="#C9CED6">{badge.info.hint}</Text>
          </View>
        ) : (
          <Text variant="small" color="#C9CED6" align="center">{running ? 'Ranked titles are handed out when the season ends.' : 'No ranked title this season. Play 3+ games next time to earn one.'}</Text>
        )}
        {races.length > 0 && (
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            {races.map((r) => (
              <View key={r.group_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, paddingHorizontal: space.md,
                borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ fontFamily: fonts.score, fontSize: 18, color: r.rank ? accent : '#8B93A0', minWidth: 44 }}>{r.rank ? ordinal(r.rank) : '–'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="smallStrong" color="#F4F6F8" numberOfLines={1}>{r.group_name}</Text>
                  <Text variant="caption" color="#9AA3AF" numberOfLines={1}>
                    {r.rank ? `of ${r.of} in the race${r.score !== null ? ` · score ${Number(r.score).toFixed(2)}` : ''}` : `${r.apps} of ${r.games} games · not in the running`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {d.sessions > 0 ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch' }}>
              <Big value={d.sessions} label="Games" muted="#9AA3AF" />
              <Big value={d.goals} label="Goals" muted="#9AA3AF" />
              <Big value={d.assists} label="Assists" muted="#9AA3AF" />
              <Big value={`${d.wins}-${d.draws}-${d.losses}`} label="W · D · L" muted="#9AA3AF" />
              <Big value={rating(d.rating)} label="Avg rating" muted="#9AA3AF" />
              <Big value={d.motm} label="MOTM" muted="#9AA3AF" />
            </View>
            <View style={{ alignSelf: 'stretch' }}><Extras d={d} colour="#C9CED6" /></View>
          </>
        ) : (
          <Text variant="small" color="#9AA3AF">No verified games this season yet.</Text>
        )}
        <Text variant="caption" color="#6B7280">matchdayapp.org</Text>
      </View>
    </View>
  );
}
