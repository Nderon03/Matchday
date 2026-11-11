import React, { useState } from 'react';
import { Coachmarks, type CoachStep } from '@/features/Coachmarks';
import { tourRef, tourTarget } from '@/features/tourTargets';
import { useOnce } from '@/features/moments/useOnce';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, IconButton, ListItem, Row, Screen, SectionTitle, Sheet, Skeleton, StatTile, Text } from '@/components/ui';
import { TaskCard } from '@/components/football/TaskCard';
import { useFriends, useHome, useMyAchievements } from '@/hooks/queries';
import { StreakFlame } from '@/components/football/Streak';
import { GetStarted } from '@/features/GetStarted';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { formatKickoff, plural, rating } from '@/domain/format';
import { usePriceLabel } from '@/hooks/useFees';
import { useLayout } from '@/hooks/useLayout';
import { NearlyThere } from '@/features/moments/NearlyThere';
import { SeasonCard, SeasonReveal, useMySeasons } from '@/features/Seasons';
import { HelpButton } from '@/features/ScreenHelp';
import { MatchdayHero, isMatchday } from '@/features/MatchdayHero';
import { useNow } from '@/hooks/useNow';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const APP_TOUR: CoachStep[] = [
  { emoji: '⚽', title: 'Welcome to MATCHDAY', body: 'Organise games, pick fair teams, track your stats and settle up, all in one place. Here’s a 30-second look around.' },
  { target: tourTarget('tab-index'), emoji: '🏠', title: 'Home', body: 'Your next game, anything you need to do (vote, pay, reply) and your form, at a glance.' },
  { target: tourTarget('tab-matches'), emoji: '📅', title: 'Matches', body: 'Every game you’re in or invited to. Tap one for the squad, teams, check-in and results.' },
  { target: tourTarget('tab-create'), emoji: '➕', title: 'Create', body: 'Set up a game in about 30 seconds, start a group, or reuse a saved ☆ preset.' },
  { target: tourTarget('tab-leagues'), emoji: '🏆', title: 'Leagues', body: 'Your groups and the leaderboards. Goals, wins and MOTMs move you up the tables.' },
  { target: tourTarget('tab-profile'), emoji: '🪪', title: 'Your player card', body: 'Your stats on a card. Earn medals to unlock cooler styles and titles, then show it off.' },
  { target: tourTarget('friends'), emoji: '🤝', title: 'Friends', body: 'Add mates by username or QR code to invite them to games and compare stats.' },
  { target: tourTarget('bell'), emoji: '🔔', title: 'Notifications', body: 'Invites, line-ups, votes and payment reminders land here.' },
  { target: tourTarget('help'), emoji: '❓', title: 'Help is up here', body: 'Replay this tour or read the FAQ any time.' },
  { emoji: '🎉', title: 'You’re all set', body: 'Start by adding a few friends or joining a group, then get your first game in the calendar.' },
];

export default function Home() {
  const { profile, userId } = useAuth();
  // the season everyone's in (ranked), and the big reveal when one ends
  const seasons = useMySeasons(!!userId);
  const friends = useFriends();
  const mine = useMyAchievements();
  const streak = mine.data?.streak.current ?? 0;
  const { colors } = useTheme();
  const { isWide } = useLayout();
  const home = useHome();
  const [allTasks, setAllTasks] = useState(false);
  const now = useNow(60_000);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // Settings → Replay the app tour comes here with ?tour=1
  const { tour: tourParam } = useLocalSearchParams<{ tour?: string }>();
  // the app tour: once, the first time you land on Home (replay from ? → Replay the app tour)
  const firstTour = useOnce(userId ? `matchday.appTour.${userId}` : null, !!home.data);
  const price = usePriceLabel();
  const d = home.data;
  const next = d?.next_session;
  const career = d?.career;

  const endTour = () => { setTourOpen(false); firstTour.markDone(); if (tourParam) router.setParams({ tour: undefined }); };

  return (
    <Screen onRefresh={() => home.refetch()} refreshing={home.isRefetching}>
      {!!seasons.data && !!userId && <SeasonReveal data={seasons.data} userId={userId} />}
      <Coachmarks steps={APP_TOUR} visible={tourOpen || firstTour.due || tourParam === '1'} onDone={endTour} finishLabel="Let’s play" />
      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Help">
        <ListItem title="Replay the app tour" subtitle="A 30-second look around" left={<Ionicons name="play-circle-outline" size={20} color={colors.primary} />}
          onPress={() => { setHelpOpen(false); setTimeout(() => setTourOpen(true), 300); }} />
        <ListItem title="Help & FAQ" subtitle="Payments, waiting lists, medals, hosting" left={<Ionicons name="help-buoy-outline" size={20} color={colors.textMuted} />}
          onPress={() => { setHelpOpen(false); router.push('/help'); }} />
        <ListItem title="Send feedback" subtitle="Something broken, or an idea? Tell us" left={<Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.textMuted} />}
          onPress={() => { setHelpOpen(false); router.push('/settings/feedback'); }} />
      </Sheet>
      {/* the name gives way (one line, shortened) so Help, Friends and Notifications always fit */}
      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }} gap={space.sm}>
        <Row gap={space.md} style={{ flex: 1, minWidth: 0 }}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="small" tone="muted" numberOfLines={1}>{greeting()}</Text>
            <Text variant="h2" numberOfLines={1}>{profile?.display_name ?? ''}</Text>
          </View>
        </Row>
        <Row style={{ flexShrink: 0 }}>
          <View ref={tourRef('help')} nativeID="spot-help" collapsable={false}><HelpButton label="Help" size={40} onPress={() => setHelpOpen(true)} /></View>
          <View ref={tourRef('friends')} nativeID="spot-friends" collapsable={false}><IconButton icon="people-outline" label="Friends" onPress={() => router.push('/friends')} /></View>
          <View ref={tourRef('bell')} nativeID="spot-bell" collapsable={false}><IconButton icon="notifications-outline" label="Notifications" badge={d?.unread_notifications} onPress={() => router.push('/notifications')} /></View>
        </Row>
      </Row>

      {!!home.error && !d ? <ErrorState error={home.error} onRetry={home.refetch} /> : null}
      {!!home.isLoading && (
        <View style={{ gap: space.md }}>
          <Skeleton height={150} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      )}

      {!!d && (
        <>
          {!!userId && !!friends.data && (career?.sessions ?? 0) < 3 && (
            <GetStarted
              userId={userId}
              progress={{
                photo: !!profile?.avatar_url,
                group: d.groups.length > 0,
                friends: friends.data.friends.length > 0 || friends.data.outgoing.length > 0,
                game: !!next || (career?.sessions ?? 0) > 0,
              }}
            />
          )}

          {d.tasks.length > 0 && (
            <View style={{ gap: space.sm }}>
              <SectionTitle title={`To do · ${d.tasks.length}`} action={d.tasks.length > 3 ? (allTasks ? 'Show less' : 'Show all') : undefined} onAction={() => setAllTasks((v) => !v)} />
              {(allTasks ? d.tasks : d.tasks.slice(0, 3)).map((t: any, i: number) => <TaskCard key={`${t.kind}-${t.session_id}-${i}`} task={t} />)}
            </View>
          )}

          <View style={{ gap: space.sm }}>
            <SectionTitle title={next && isMatchday(next.starts_at, now) ? 'Today' : 'Next up'} />
            {next && isMatchday(next.starts_at, now) ? (
              <MatchdayHero game={next} onPress={() => router.push(`/session/${next.id}`)}>
                <Row gap={space.sm}>
                  <Button title={next.lineup_ready ? 'Teams' : 'Squad'} size="sm" variant="secondary" icon="shirt-outline" onPress={() => router.push(`/session/${next.id}/lineup`)} />
                  <Button title="Open game" size="sm" iconRight="arrow-forward" onPress={() => router.push(`/session/${next.id}`)} />
                </Row>
              </MatchdayHero>
            ) : next ? (
              <Card variant="highlight" onPress={() => router.push(`/session/${next.id}`)} accessibilityLabel={`Next game: ${next.name}`}>
                <View style={{ gap: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="overline" tone="primary">{next.format_size}-a-side</Text>
                    {next.my_status === 'waitlisted' ? <Badge label="Waiting list" tone="warning" /> : <Badge label="You're in" tone="success" />}
                  </Row>
                  <Text variant="h2">{next.name}</Text>
                  <View style={{ gap: 6 }}>
                    <Row gap={6}><Ionicons name="time-outline" size={16} color={colors.textMuted} /><Text tone="muted">{formatKickoff(next.starts_at)}</Text></Row>
                    {(next.venue || next.location) && <Row gap={6}><Ionicons name="location-outline" size={16} color={colors.textMuted} /><Text tone="muted">{[next.venue, next.location].filter(Boolean).join(' · ')}</Text></Row>}
                    <Row gap={6}><Ionicons name="people-outline" size={16} color={colors.textMuted} /><Text tone="muted">{next.confirmed}/{next.max_attendance} confirmed{next.payment_mode !== 'free' ? ` · ${price(next.price_pence).total} each` : ''}</Text></Row>
                  </View>
                  <Row gap={space.sm}>
                    <Button title={next.lineup_ready ? 'View teams' : 'Squad'} size="sm" variant="secondary" icon="shirt-outline" onPress={() => router.push(`/session/${next.id}/lineup`)} />
                    {!!next.is_host && <Button title="Manage" size="sm" variant="ghost" onPress={() => router.push(`/session/${next.id}`)} />}
                  </Row>
                </View>
              </Card>
            ) : (
              <Card>
                <EmptyState icon="calendar-outline" title="No upcoming games" message="Organise a kickabout and invite your squad." action={{ label: 'Create a game', onPress: () => router.push('/create') }} />
              </Card>
            )}
          </View>

          <View style={{ flexDirection: isWide ? 'row' : 'column', gap: space.lg }}>
            <View style={{ flex: 1, gap: space.sm }}>
              <SectionTitle title="Your career" action="Profile" onAction={() => router.navigate('/profile')} />
              {streak >= 2 && (
                <Card variant="alt" onPress={() => router.push('/achievements')} accessibilityLabel={`${streak}-week streak`} style={{ paddingVertical: space.sm }}>
                  <Row gap={space.sm}>
                    <StreakFlame active />
                    <Text variant="smallStrong" style={{ flex: 1 }}>{streak}-week streak</Text>
                    <Text variant="caption" tone="muted">Weeks in a row</Text>
                  </Row>
                </Card>
              )}
              <Row gap={space.sm}>
                <StatTile label="Rating" value={rating(career?.rating)} accent compact />
                <StatTile label="Games" value={career?.sessions ?? 0} compact />
                <StatTile label="Goals" value={career?.goals ?? 0} compact />
                <StatTile label="MOTM" value={career?.motm ?? 0} compact />
              </Row>
              <NearlyThere data={mine.data} />
              {!!seasons.data && <SeasonCard data={seasons.data} />}
            </View>
          </View>

          {d.recent_results.length > 0 && (
            <View style={{ gap: space.sm }}>
              <SectionTitle title="Recent results" action="All matches" onAction={() => router.navigate('/matches')} />
              {d.recent_results.slice(0, 2).map((r: any) => (
                <Card key={r.session_id} onPress={() => router.push(`/session/${r.session_id}`)}>
                  <Row gap={space.md}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{r.name}</Text>
                      <Text variant="small" tone="muted">{formatKickoff(r.played_at)} · {r.wins}W {r.draws}D {r.losses}L{r.goals ? ` · ${plural(r.goals, 'goal')}` : ''}</Text>
                    </View>
                    {!!r.motm && <Ionicons name="star" size={18} color={colors.gold} accessibilityLabel="Man of the Match" />}
                    <Text variant="statSmall" tone={r.rating_eligible ? 'primary' : 'faint'}>{r.rating_eligible ? rating(r.rating_avg) : '–'}</Text>
                  </Row>
                </Card>
              ))}
            </View>
          )}


        </>
      )}
    </Screen>
  );
}
