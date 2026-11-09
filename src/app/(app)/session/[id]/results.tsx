import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, ErrorState, Header, Input, Loading, Row, Screen, SectionTitle, Sheet, SwipeSelect, Text, useConfirm } from '@/components/ui';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { ScreenHelp } from '@/features/ScreenHelp';
import { haptics } from '@/lib/haptics';

export default function ResultsScreen() {
  const { id, correct } = useLocalSearchParams<{ id: string; correct?: string }>();
  const { colors } = useTheme();
  const detail = useSessionDetail(id);
  const { run, busy } = useAction([keys.session(id), keys.mySessions]);
  const confirm = useConfirm();
  const [scores, setScores] = useState<Record<string, { a: number; b: number }>>({});
  const [nextOpen, setNextOpen] = useState(false);
  // the score that was just saved, shown at the top of the "what's next?" sheet
  const [justPlayed, setJustPlayed] = useState<string | null>(null);
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
  // nobody to play against: the game didn't happen, so offer to cancel it instead of a score
  const playersIn = d.attendance.filter((a) => a.status === 'confirmed').length + d.guests.filter((g) => g.status === 'confirmed').length;
  const nothingPlayed = !d.fixtures.some((f) => f.played);
  const cancelGame = async () => {
    const r = await confirm({ title: 'Cancel this game?', message: 'Everyone will be notified and any payments refunded or released.', confirmLabel: 'Cancel game', cancelLabel: 'Keep it', destructive: true, reasonLabel: 'Reason (optional, shown to players)' });
    if (!r) return;
    const ok = await run('cancel', async () => { await rpc('cancel_session', { p_session: id, p_reason: typeof r === 'object' && r.reason ? r.reason : null }); return true; }, 'Game cancelled');
    if (ok) router.replace(`/session/${id}`);
  };
  const allPlayed = d.fixtures.every((f) => f.played);

  const addFixture = async (mode: 'keep' | 'balanced' | 'random' | 'manual') => {
    setNextOpen(false);
    setJustPlayed(null);
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
                playersIn < 2 && nothingPlayed && !locked ? (
                  <View style={{ gap: space.sm }}>
                    <Text tone="muted">Only {playersIn === 1 ? '1 player' : 'nobody'} signed up, so there are no teams to pick and no score to record.</Text>
                    <Button title="It didn’t happen: cancel game" icon="close-circle-outline" variant="danger" loading={busy === 'cancel'} onPress={cancelGame} />
                  </View>
                ) : (
                  <View style={{ gap: space.sm }}>
                    <Text tone="muted">Pick the teams before recording a score.</Text>
                    <Button title="Pick teams" icon="shirt-outline" variant="secondary" onPress={() => router.push({ pathname: '/session/[id]/lineup', params: { id, fixture: f.id } })} />
                  </View>
                )
              ) : (
                <>
                  {/* scoreboard: each team's name, the score big, and − / + underneath (fits the narrowest phones) */}
                  <Row style={{ alignItems: 'flex-start' }}>
                    <ScoreBox name={f.teams[0]?.name ?? 'Team A'} color={colors.teamA} value={sc.a} onChange={(v) => setScores((x) => ({ ...x, [f.id]: { ...sc, a: v } }))} />
                    <Text variant="h2" tone="faint" style={{ marginTop: 34 }}>–</Text>
                    <ScoreBox name={f.teams[1]?.name ?? 'Team B'} value={sc.b} onChange={(v) => setScores((x) => ({ ...x, [f.id]: { ...sc, b: v } }))} />
                  </Row>
                  {!locked && (
                    <Button
                      title={correcting ? 'Apply correction' : f.played ? 'Update score' : 'Save score'}
                      loading={busy === `score-${f.id}`}
                      disabled={!!correcting && reason.trim().length < 3}
                      onPress={async () => {
                        const firstSave = !correcting && !f.played && f.id === last.id;
                        const ok = await run(`score-${f.id}`, async () => {
                          await (correcting
                            ? rpc('correct_session', { p_session: id, p_kind: 'score', p_data: { fixture_id: f.id, score_a: sc.a, score_b: sc.b }, p_reason: reason })
                            : rpc('record_fixture_score', { p_fixture: f.id, p_score_a: sc.a, p_score_b: sc.b }));
                          return true;
                        }, correcting ? 'Correction applied' : firstSave ? undefined : 'Score saved');
                        // full time on this game: straight on to what happens next
                        if (ok && firstSave) { haptics.whistle(); setJustPlayed(`${f.teams[0]?.name} ${sc.a}–${sc.b} ${f.teams[1]?.name}`); setNextOpen(true); }
                      }}
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
          {nothingPlayed && playersIn >= 2 && (
            <Text variant="smallStrong" tone="danger" align="center" accessibilityRole="button" onPress={cancelGame} style={{ marginTop: space.sm }}>Didn’t happen? Cancel the game</Text>
          )}
        </View>
      )}

      <Sheet visible={nextOpen} onClose={() => { setNextOpen(false); setJustPlayed(null); }}
        title={justPlayed ? `Game ${last.number} done. What’s next?` : `Game ${last.number + 1}: teams`}>
        {!!justPlayed && <Text variant="h3" align="center">{justPlayed}</Text>}
        <Button title={`Game ${last.number + 1}: new fair teams`} icon="shuffle" onPress={() => addFixture('balanced')} />
        <Text variant="caption" tone="muted" align="center">Balanced on ratings and mixed up from the last game.</Text>
        <Button title="Same teams again" icon="copy-outline" variant="secondary" onPress={() => addFixture('keep')} />
        <Button title="Pick the teams myself" icon="hand-left-outline" variant="secondary" onPress={() => addFixture('manual')} />
        {!!justPlayed && (
          <Button title="That’s it, full time" icon="flag" variant="ghost" onPress={() => { setNextOpen(false); setJustPlayed(null); setCompleteOpen(true); }} />
        )}
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
          if (ok !== undefined) haptics.whistle();
          if (ok !== undefined) { setCompleteOpen(false); router.replace(`/session/${id}`); }
        }} />
      </Sheet>
    </Screen>
  );
}

/** One team's score: name, the number in the scoreboard font, and − / + buttons below it. */
function ScoreBox({ name, color, value, onChange }: { name: string; color?: string; value: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  const change = (d: number) => {
    const next = Math.min(99, Math.max(0, value + d));
    if (next !== value) { haptics.tap(); onChange(next); }
  };
  const btn = (d: number, icon: 'remove' | 'add', disabled: boolean) => (
    <Pressable onPress={() => change(d)} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${d > 0 ? 'Add a goal for' : 'Take a goal off'} ${name}`}
      style={({ pressed }) => ({ width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
        backgroundColor: d > 0 ? colors.primaryMuted : colors.elevated, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={22} color={d > 0 ? colors.primary : colors.text} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: space.xs, minWidth: 0 }}
      accessible accessibilityRole="adjustable" accessibilityLabel={`${name} score`} accessibilityValue={{ min: 0, max: 99, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => change(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Text variant="bodyStrong" numberOfLines={1} color={color} style={{ maxWidth: '100%' }}>{name}</Text>
      <Text style={{ fontFamily: fonts.scoreHeavy, fontSize: 56, lineHeight: 60, color: colors.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {btn(-1, 'remove', value <= 0)}
        {btn(1, 'add', value >= 99)}
      </View>
    </View>
  );
}
