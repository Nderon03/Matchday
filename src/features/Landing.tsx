import React, { useState } from 'react';
import { Linking, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen, Text } from '@/components/ui';
import { PlayerCard, type PlayerCardData } from '@/components/football/PlayerCard';
import { Rise, StadiumHero } from '@/features/AuthShell';
import { MatchdayHero } from '@/features/MatchdayHero';
import { CONTACT_EMAIL, TRADING_NAME } from '@/legal/content';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.matchday.android';
const PITCH = '#22C55E';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'megaphone-outline', title: 'Fill every game', body: 'Invite your squad in one tap. A waiting list that offers spare places, and “Need players” when you’re short.' },
  { icon: 'git-compare-outline', title: 'Fair teams in seconds', body: 'Balanced from everyone’s ratings and form. Drag to tweak, confirm, and everyone sees the line-ups.' },
  { icon: 'trophy-outline', title: 'Stats that matter', body: 'Goals, assists, ratings and Man of the Match votes. Medals, tables and a player card that levels up.' },
  { icon: 'card-outline', title: 'Payments sorted', body: 'Pay upfront or after. No more chasing money in the group chat: it settles up for you.' },
];

const DEMO_CARD: PlayerCardData = {
  display_name: 'Sam Carter', username: 'sam', avatar_url: null, position: 'MID', card_style: 'gold', title: 'baller',
  stats: { rating: 7.8, sessions: 42, fixtures: 96, wins: 51, losses: 33, win_pct: 53, goals: 61, assists: 22, motm: 9 },
  achievements: 17, nationality: 'GB', supported_club: null, medals: ['goals_l3', 'motm_l2', 'apps_l3'], reliability: { pct: 100, attended: 24 },
};

/** matchdayapp.org for people who aren't signed in: what MATCHDAY is, and how to get it. */
export function Landing() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const heroH = wide ? 520 : 540;
  const [kickoff] = useState(() => new Date(Date.now() + 2 * 3600_000 + 14 * 60_000).toISOString());

  return (
    <Screen edges={[]} padded={false} maxWidth={4000} contentStyle={{ paddingTop: 0 }}>
      {/* hero */}
      <View style={{ height: heroH, backgroundColor: '#06140C' }}>
        <StadiumHero height={heroH} ball={false} fadeTo="#06140C" />
        <View style={{ position: 'absolute', top: space.lg, left: 0, right: 0, paddingHorizontal: space.lg, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1100 - space.lg * 2, width: '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: PITCH, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="football" size={17} color="#04130A" />
            </View>
            <Text style={{ color: '#F4F6F8', fontWeight: '800', letterSpacing: 3, fontSize: 15 }}>MATCHDAY</Text>
          </View>
          <Pressable onPress={() => router.push('/sign-in')} accessibilityRole="link" hitSlop={8}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent' })}>
            <Text style={{ color: '#F4F6F8', fontWeight: '700' }}>Sign in</Text>
          </Pressable>
        </View>
        </View>
        <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: wide ? 70 : 40, alignItems: 'center', gap: space.md }}>
          <Rise delay={60}>
            <Text style={{ color: PITCH, fontFamily: fonts.score, fontSize: 16, letterSpacing: 4, textAlign: 'center' }}>YOUR WEEKLY GAME, SORTED</Text>
          </Rise>
          <Rise delay={160}>
            <Text accessibilityRole="header" style={{ color: '#F4F6F8', fontFamily: fonts.scoreHeavy, fontSize: wide ? 76 : 50, lineHeight: wide ? 78 : 54, textAlign: 'center', letterSpacing: 0.5 }}>
              ORGANISE. PLAY.{'\n'}SETTLE UP.
            </Text>
          </Rise>
          <Rise delay={260}>
            <Text style={{ color: '#B6C7BD', fontSize: wide ? 18 : 16, lineHeight: wide ? 26 : 23, textAlign: 'center', maxWidth: 560 }}>
              Invites, waiting lists, fair teams, stats and payments for your 5-a-side. All in one place, for free.
            </Text>
          </Rise>
          <Rise delay={360}>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.sm, alignItems: 'center', marginTop: space.sm }}>
              <Pressable onPress={() => Linking.openURL(PLAY_URL)} accessibilityRole="link" accessibilityLabel="Get it on Google Play"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', opacity: pressed ? 0.85 : 1 })}>
                <Ionicons name="logo-google-playstore" size={24} color="#F4F6F8" />
                <View>
                  <Text style={{ color: '#C9D1D9', fontSize: 10, letterSpacing: 0.5 }}>GET IT ON</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: -2 }}>Google Play</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push('/sign-up')} accessibilityRole="link"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, paddingHorizontal: 24, borderRadius: radius.md, backgroundColor: PITCH, opacity: pressed ? 0.9 : 1 })}>
                <Text style={{ color: '#04130A', fontSize: 16, fontWeight: '800' }}>Start in your browser</Text>
                <Ionicons name="arrow-forward" size={18} color="#04130A" />
              </Pressable>
            </View>
          </Rise>
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.xxl, gap: space.huge, paddingBottom: space.huge }}>
        {/* features */}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.md }}>
          {FEATURES.map((f, i) => (
            <Rise key={f.title} delay={120 + i * 80}>
              <View style={{ flex: wide ? 1 : undefined, width: wide ? (1100 - space.lg * 2 - space.md * 3) / 4 : undefined, gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: wide ? 210 : undefined }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={f.icon} size={22} color={colors.primary} />
                </View>
                <Text variant="h3">{f.title}</Text>
                <Text tone="muted" variant="small">{f.body}</Text>
              </View>
            </Rise>
          ))}
        </View>

        {/* showcase */}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.xxl, alignItems: wide ? 'center' : 'stretch' }}>
          <View style={{ flex: wide ? 1 : undefined, gap: space.md }}>
            <Text style={{ color: colors.primary, fontFamily: fonts.score, fontSize: 15, letterSpacing: 3 }}>YOUR CARD. YOUR MATCHDAY.</Text>
            <Text style={{ fontSize: wide ? 40 : 30, lineHeight: wide ? 46 : 36, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>Every game counts.</Text>
            <Text tone="muted">Your player card levels up as you play: Bronze to Hall of Fame, with titles and medals to show off. On the day, the app turns into matchday mode with the countdown to kick-off.</Text>
            <View style={{ maxWidth: 440, width: '100%' }}>
              <MatchdayHero game={{ name: 'Wednesday Football', starts_at: kickoff, duration_minutes: 60, venue: 'Riverside, Pitch 2', format_size: 5, confirmed: 9, max_attendance: 10 }} />
            </View>
          </View>
          <View style={{ flex: wide ? 1 : undefined, maxWidth: 460, width: '100%', alignSelf: 'center' }}>
            <PlayerCard data={DEMO_CARD} />
          </View>
        </View>

        {/* how it works */}
        <View style={{ gap: space.lg }}>
          <Text style={{ fontSize: wide ? 32 : 26, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Up and running in a minute</Text>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.md }}>
            {[
              ['1', 'Start a group', 'Your regular squad, with its own tables and seasons.'],
              ['2', 'Invite your mates', 'Share a link or QR code. They tap “I’m in”.'],
              ['3', 'Play, vote, repeat', 'Scores, MOTM, ratings and stats, every week.'],
            ].map(([n, t, b]) => (
              <View key={n} style={{ flex: wide ? 1 : undefined, flexDirection: 'row', gap: space.md, alignItems: 'flex-start', padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}>
                <Text style={{ fontFamily: fonts.scoreHeavy, fontSize: 40, lineHeight: 42, color: colors.primary }}>{n}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyStrong">{t}</Text>
                  <Text tone="muted" variant="small">{b}</Text>
                </View>
              </View>
            ))}
          </View>
          <Pressable onPress={() => router.push('/sign-up')} accessibilityRole="link"
            style={({ pressed }) => ({ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 26, borderRadius: radius.md, backgroundColor: PITCH, opacity: pressed ? 0.9 : 1 })}>
            <Text style={{ color: '#04130A', fontSize: 16, fontWeight: '800' }}>Create your free account</Text>
            <Ionicons name="arrow-forward" size={18} color="#04130A" />
          </Pressable>
        </View>

        {/* footer */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.lg, flexDirection: wide ? 'row' : 'column', gap: space.md, justifyContent: 'space-between', alignItems: wide ? 'center' : 'flex-start' }}>
          <Text variant="small" tone="muted">© {new Date(kickoff).getFullYear()} {TRADING_NAME} · MATCHDAY</Text>
          <View style={{ flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' }}>
            <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => router.push('/help')}>Help</Text>
            <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => router.push('/legal/privacy')}>Privacy</Text>
            <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => router.push('/legal/terms')}>Terms</Text>
            <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>Contact</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}
