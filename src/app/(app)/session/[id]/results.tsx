import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, ErrorState, Header, Input, Loading, Row, Screen, SectionTitle, Sheet, Stepper, SwipeSelect, Text } from '@/components/ui';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { ScreenHelp } from '@/features/ScreenHelp';

export default function ResultsScreen() {
  const { id, correct } = useLocalSearchParams<{ id: string; correct?: string }>();
  const { colors } = useTheme();
  const detail = useSessionDetail(id);
  const { run, busy } = useAction([keys.session(id), keys.mySessions]);
  const [scores, setScores] = useState<Record<string, { a: number; b: number }>>({});
  const [nextOpen, setNextOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [votingHours, setVotingHours] = useState(48);
  const [reason, setReason] = useState('');
  const d = detail.data;


  if (detail.isLoading) return <Screen><Header title="Scores" /><Loading /></Screen>;
  if (!d) return <Screen><Header title="Scores" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  if (!d.isManager) return <Screen><Header title="Scores" /><ErrorState error={{ hint: 'forbidden', message: 'Only the host can record scores.' }} /></Screen>;

  const s = d.session;
  const correcting = s.status === 'finalised' && correct === '1';
  const locked = (s.status === 'completed' || s.status === 'finalised') && !correcting;
  const last = d.fixtures[d.fixtures.length - 1];
  const allPlayed = d.fixtures.every((f) => f.played);

  const addFixture = async (mode: 'keep' | 'balanced' | 'random' | 'manual') => {
    setNextOpen(false);
    const fid = await run('add', () => rpc<string>('add_fixture', { p_session: id, p_copy_from: mode === 'keep' ? last.id : null }),
      mode === 'keep' ? `Game ${last.number + 1} added with the same teams` : undefined);
    if (fid && mode !== 'keep') router.push({ pathname: '/session/[id]/lineup', params: { id, fixture: fid, ...(mode !== 'manual' ? { auto: mode } : {}) } });
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title={correcting ? 'Correct a result' : 'Scores'} subtitle={s.name} right={<ScreenHelp id="results" />} />
      {!!correcting && (
        <Card variant="alt">
          <Text variant="small">Corrections after finalisation are recorded in the audit log and statistics are recalculated for everyone.</Text>
          <View style={{ marginTop: space.md }}><Input label="Reason (required)" value={reason} onChangeText={setReason} placeholder="e.g. Late goal was missed" /></View>
        </Card>
      )}
      {d.fixtures.map((f) => {
        const sc = scores[f.id] ?? { a: f.teams[0]?.score ?? 0, b: f.teams[1]?.score ?? 0 };
        const hasTeams = (f.teams[0]?.players.length ?? 0) > 0 && (f.teams[1]?.players.length ?? 0) > 0;
        return (
          <Card key={f.id}>
            <View style={{ gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="overline" tone="muted">{d.fixtures.length > 1 ? `Game ${f.number}` : 'Final score'}</Text>
                <Row gap={space.sm}>
                  {!f.played && !locked && d.fixtures.length > 1 && (
                    <Text variant="smallStrong" tone="danger" accessibilityRole="button" onPress={() => run(`del-${f.id}`, () => rpc('delete_fixture', { p_fixture: f.id }), 'Game removed')}>Remove</Text>
                  )}
                  {f.played ? <Badge label="Recorded" tone="success" /> : <Badge label="Not played" />}
                </Row>
              </Row>
              {!hasTeams ? (
                <View style={{ gap: space.sm }}>
                  <Text tone="muted">Pick the teams before recording a score.</Text>
                  <Button title="Pick teams" icon="shirt-outline" variant="secondary" onPress={() => router.push({ pathname: '/session/[id]/lineup', params: { id, fixture: f.id } })} />
                </View>
              ) : (
                <>
                  <Row style={{ justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center', gap: space.sm, flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1} color={colors.teamA}>{f.teams[0]?.name}</Text>
                      <Stepper size="lg" value={sc.a} label={`${f.teams[0]?.name} score`} onChange={(v) => setScores((x) => ({ ...x, [f.id]: { ...sc, a: v } }))} />
                    </View>
                    <Text variant="h2" tone="faint">–</Text>
                    <View style={{ alignItems: 'center', gap: space.sm, flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{f.teams[1]?.name}</Text>
                      <Stepper size="lg" value={sc.b} label={`${f.teams[1]?.name} score`} onChange={(v) => setScores((x) => ({ ...x, [f.id]: { ...sc, b: v } }))} />
                    </View>
                  </Row>
                  {!locked && (
                    <Button
                      title={correcting ? 'Apply correction' : f.played ? 'Update score' : 'Save score'}
                      loading={busy === `score-${f.id}`}
                      disabled={!!correcting && reason.trim().length < 3}
                      onPress={() => run(`score-${f.id}`, () => correcting
                        ? rpc('correct_session', { p_session: id, p_kind: 'score', p_data: { fixture_id: f.id, score_a: sc.a, score_b: sc.b }, p_reason: reason })
                        : rpc('record_fixture_score', { p_fixture: f.id, p_score_a: sc.a, p_score_b: sc.b }), correcting ? 'Correction applied' : 'Score saved')}
                    />
                  )}
                </>
              )}
            </View>
          </Card>
        );
      })}

      {!locked && !correcting && (
        <View style={{ gap: space.sm }}>
          <Button title={`Add game ${last.number + 1}`} icon="add" variant="secondary" onPress={() => setNextOpen(true)} disabled={!last.played} />
          {!last.played && d.fixtures.length > 0 && <Text variant="caption" tone="faint" align="center">Record game {last.number} before adding another.</Text>}
          <SectionTitle title="Full time" />
          <Button title="Complete game" icon="flag" size="lg" disabled={!allPlayed} onPress={() => setCompleteOpen(true)} />
          {!allPlayed && <Text variant="caption" tone="muted" align="center">Every game needs a score — record it or remove the game.</Text>}
        </View>
      )}

      <Sheet visible={nextOpen} onClose={() => setNextOpen(false)} title={`Game ${last.number + 1}: teams`}>
        <Button title="Keep the same teams" icon="copy-outline" onPress={() => addFixture('keep')} />
        <Button title="Suggest balanced teams" icon="analytics-outline" variant="secondary" onPress={() => addFixture('balanced')} />
        <Button title="Randomise teams" icon="shuffle" variant="secondary" onPress={() => addFixture('random')} />
        <Button title="Pick manually" icon="hand-left-outline" variant="ghost" onPress={() => addFixture('manual')} />
      </Sheet>

      <Sheet visible={completeOpen} onClose={() => setCompleteOpen(false)} title="Complete game">
        <Text tone="muted">
          Scores lock, attendance is settled (players in a line-up are verified unless you marked them absent), and players are asked to submit goals, vote for MOTM and rate each other.
          {s.payment_mode === 'after' ? ' Payment requests are sent now.' : ''}
        </Text>
        <SwipeSelect label="Voting window" value={votingHours} onChange={setVotingHours}
          options={[12, 24, 48, 72].map((h) => ({ value: h, label: `${h} hours`, detail: h === 24 ? 'Usually long enough for everyone to vote.' : undefined }))} />
        <Button title="Complete & open voting" icon="flag" loading={busy === 'complete'} onPress={async () => {
          const ok = await run('complete', () => rpc('complete_session', { p_session: id, p_voting_hours: votingHours }), 'Full time! Voting is open.');
          if (ok !== undefined) { setCompleteOpen(false); router.replace(`/session/${id}`); }
        }} />
      </Sheet>
    </Screen>
  );
}
