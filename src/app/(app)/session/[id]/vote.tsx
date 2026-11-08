import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, EmptyState, ErrorState, Header, Loading, Row, Screen, SectionTitle, Segmented, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useSessionDetail } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { timeUntil } from '@/domain/format';
import { haptics } from '@/lib/haptics';
import { ScreenHelp } from '@/features/ScreenHelp';

interface VotingState {
  open: boolean;
  closes_at: string | null;
  eligible: boolean;
  motm_mode: 'session' | 'fixture';
  motm_voted: boolean;
  motm_voted_fixtures: string[];
  rated_user_ids: string[];
  participants: { user_id: string; username: string; display_name: string; avatar_url: string | null }[];
}

const SCALE: Record<number, string> = { 10: 'Outstanding', 9: 'Excellent', 8: 'Very good', 7: 'Good', 6: 'Average', 5: 'Below par', 4: 'Below average', 3: 'Poor', 2: 'Very poor', 1: 'Very poor' };

export default function VoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const detail = useSessionDetail(id);
  const state = useQuery({ queryKey: ['voting', id], queryFn: () => rpc<VotingState>('get_voting_state', { p_session: id }) });
  const [motm, setMotm] = useState<string | null>(null);
  const [fixtureId, setFixtureId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  if (state.isLoading || detail.isLoading) return <Screen><Header title="Vote" /><Loading /></Screen>;
  if (!state.data) return <Screen><Header title="Vote" /><ErrorState error={state.error} onRetry={state.refetch} /></Screen>;
  const v = state.data;
  const others = v.participants.filter((p) => p.user_id !== userId);
  const toRate = others.filter((p) => !v.rated_user_ids.includes(p.user_id));
  const fixtures = detail.data?.fixtures ?? [];
  const activeFixture = v.motm_mode === 'fixture' ? fixtureId ?? fixtures.find((f) => !v.motm_voted_fixtures.includes(f.id))?.id ?? null : null;
  const motmDone = v.motm_mode === 'fixture' ? fixtures.every((f) => v.motm_voted_fixtures.includes(f.id)) : v.motm_voted;
  const fixtureVoted = activeFixture ? v.motm_voted_fixtures.includes(activeFixture) : v.motm_voted;
  const allDone = motmDone && toRate.length === 0;

  if (!v.eligible) {
    return <Screen><Header title="Vote" /><EmptyState icon="lock-closed-outline" title="Voting is for players who took part" message="Only verified participants can vote and rate." /></Screen>;
  }
  if (!v.open && !allDone) {
    return <Screen><Header title="Vote" /><EmptyState icon="time-outline" title="Voting has closed" message="Results are revealed once the host finalises the game." action={{ label: 'Back to the game', onPress: () => router.replace(`/session/${id}`) }} /></Screen>;
  }

  const submit = async () => {
    setBusy(true);
    try {
      if (motm && !fixtureVoted) await rpc('cast_motm_vote', { p_session: id, p_nominee: motm, p_fixture: activeFixture });
      const payload = Object.entries(ratings).filter(([uid]) => toRate.some((p) => p.user_id === uid)).map(([user_id, score]) => ({ user_id, score }));
      if (payload.length) await rpc('submit_ratings', { p_session: id, p_ratings: payload });
      haptics.success();
      toast.success('Thanks — your votes are in (and anonymous)');
      setMotm(null);
      setRatings({});
      setFixtureId(null);
      await state.refetch();
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (e) {
      toast.error(e);
      state.refetch();
    } finally {
      setBusy(false);
    }
  };

  const ready = (!!motm && !fixtureVoted) || Object.keys(ratings).length > 0;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}
      footer={!allDone ? <Button title="Submit votes" size="lg" disabled={!ready} loading={busy} onPress={submit} /> : undefined}>
      <Header title="Vote & rate" subtitle={v.closes_at ? `Closes in ${timeUntil(v.closes_at)} · votes are anonymous` : 'Votes are anonymous'} right={<ScreenHelp id="vote" />} />
      {!allDone && (
        <Card variant="alt">
          <Row gap={space.sm}>
            <Ionicons name="lock-closed" size={18} color={colors.primary} />
            <Text variant="small" style={{ flex: 1 }}>
              Your votes and ratings are anonymous. Nobody, not even the host, can see who voted for whom: players only see totals and averages.
            </Text>
          </Row>
        </Card>
      )}
      {!!allDone && (
        <Card variant="highlight">
          <Row gap={space.md}>
            <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="h3">All done!</Text>
              <Text variant="small" tone="muted">MOTM and ratings are revealed when results are finalised.</Text>
            </View>
          </Row>
        </Card>
      )}

      {!motmDone && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Man of the Match" />
          {v.motm_mode === 'fixture' && fixtures.length > 1 && (
            <Segmented scroll value={activeFixture ?? ''} onChange={setFixtureId} options={fixtures.map((f) => ({ value: f.id, label: `Game ${f.number}${v.motm_voted_fixtures.includes(f.id) ? ' ✓' : ''}` }))} />
          )}
          {fixtureVoted ? <Text tone="muted">You’ve voted for this game.</Text> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {others.map((p) => {
                const on = motm === p.user_id;
                return (
                  <Pressable key={p.user_id} onPress={() => setMotm(on ? null : p.user_id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={p.display_name}
                    style={{ width: 96, alignItems: 'center', gap: 6, padding: space.sm, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.gold : colors.border, backgroundColor: on ? `${colors.gold}1A` : colors.surface }}>
                    <Avatar uri={p.avatar_url} name={p.display_name} size={52} />
                    <Text variant="caption" numberOfLines={1}>{p.display_name}</Text>
                    {!!on && <Ionicons name="star" size={16} color={colors.gold} style={{ position: 'absolute', top: 6, right: 6 }} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {toRate.length > 0 && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title={`Rate your teammates & opponents · ${Object.keys(ratings).length}/${toRate.length}`} />
          <Text variant="caption" tone="muted">10 outstanding · 8 very good · 6 average · 4 below average · 1 very poor. You can’t change ratings after submitting.</Text>
          {toRate.map((p) => (
            <Card key={p.user_id}>
              <View style={{ gap: space.sm }}>
                <Row gap={space.md}>
                  <Avatar uri={p.avatar_url} name={p.display_name} size={36} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{p.display_name}</Text>
                  {ratings[p.user_id] != null && <Text variant="small" tone="primary">{ratings[p.user_id]} · {SCALE[ratings[p.user_id]]}</Text>}
                </Row>
                <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel={`Rating for ${p.display_name}`}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                    const on = ratings[p.user_id] === n;
                    return (
                      <Pressable key={n} onPress={() => setRatings((r) => ({ ...r, [p.user_id]: n }))} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${n} out of 10`}
                        style={{ flex: 1, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surfaceAlt }}>
                        <Text variant="smallStrong" color={on ? colors.onPrimary : colors.text}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
