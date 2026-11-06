import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, IconButton, Row, Screen, SectionTitle, Skeleton, StatTile, Text } from '@/components/ui';
import { TaskCard } from '@/components/football/TaskCard';
import { FeedItemCard } from '@/components/football/FeedItem';
import { useFeed, useFriends, useHome, useMyAchievements } from '@/hooks/queries';
import { StreakFlame } from '@/components/football/Streak';
import { GetStarted } from '@/features/GetStarted';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { formatKickoff, rating } from '@/domain/format';
import { usePriceLabel } from '@/hooks/useFees';
import { useLayout } from '@/hooks/useLayout';
import { NearlyThere } from '@/features/moments/NearlyThere';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { profile, userId } = useAuth();
  const friends = useFriends();
  const mine = useMyAchievements();
  const streak = mine.data?.streak.current ?? 0;
  const { colors } = useTheme();
  const { isWide } = useLayout();
  const home = useHome();
  const feed = useFeed();
  const price = usePriceLabel();
  const d = home.data;
  const next = d?.next_session;
  const career = d?.career;

  return (
    <Screen onRefresh={() => { home.refetch(); feed.refetch(); }} refreshing={home.isRefetching}>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }}>
        <Row gap={space.md}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={44} />
          <View>
            <Text variant="small" tone="muted">{greeting()}</Text>
            <Text variant="h2">{profile?.display_name ?? ''}</Text>
          </View>
        </Row>
        <Row>
          <IconButton icon="people-outline" label="Friends" onPress={() => router.push('/friends')} />
          <IconButton icon="notifications-outline" label="Notifications" badge={d?.unread_notifications} onPress={() => router.push('/notifications')} />
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
              <SectionTitle title={`To do · ${d.tasks.length}`} action={d.tasks.length > 3 ? 'See all' : undefined} onAction={() => router.push('/tasks')} />
              {d.tasks.slice(0, 3).map((t: any, i: number) => <TaskCard key={`${t.kind}-${t.session_id}-${i}`} task={t} />)}
            </View>
          )}

          <View style={{ gap: space.sm }}>
            <SectionTitle title="Next up" />
            {next ? (
              <Card variant="highlight" onPress={() => router.push(`/session/${next.id}`)} accessibilityLabel={`Next session ${next.name}`}>
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
                <EmptyState icon="calendar-outline" title="No upcoming games" message="Organise a kickabout and invite your squad." action={{ label: 'Create a session', onPress: () => router.push('/create') }} />
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
                      <Text variant="small" tone="muted">{formatKickoff(r.played_at)} · {r.wins}W {r.draws}D {r.losses}L{r.goals ? ` · ${r.goals} ⚽` : ''}</Text>
                    </View>
                    {!!r.motm && <Ionicons name="star" size={18} color={colors.gold} accessibilityLabel="Man of the Match" />}
                    <Text variant="statSmall" tone={r.rating_eligible ? 'primary' : 'faint'}>{r.rating_eligible ? rating(r.rating_avg) : '–'}</Text>
                  </Row>
                </Card>
              ))}
            </View>
          )}


          <View style={{ gap: space.sm }}>
            <SectionTitle title="Activity" />
            {feed.data?.pages[0]?.slice(0, 3).map((item) => <FeedItemCard key={item.id} item={item} />)}
            {!!feed.data && feed.data.pages[0].length === 0 && <Text tone="muted" variant="small">Activity from your friends and groups will appear here.</Text>}
          </View>
        </>
      )}
    </Screen>
  );
}
