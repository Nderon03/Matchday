import React, { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Avatar, Badge, Button, Card, ErrorState, Header, Input, Loading, Row, Screen, SectionTitle, Sheet, Stepper, Text } from '@/components/ui';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { useAuth } from '@/providers/AuthProvider';
import { rpc } from '@/lib/api';
import { validateGoalClaim } from '@/domain/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { GoalSubmission, SubmissionStatus } from '@/types/db';
import { plural } from '@/domain/format';
import { ScreenHelp } from '@/features/ScreenHelp';

const STATUS: Record<SubmissionStatus, { label: string; tone: 'warning' | 'success' | 'danger' | 'primary' | 'neutral' }> = {
  pending: { label: 'Awaiting approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  corrected: { label: 'Corrected by host', tone: 'primary' },
  rejected: { label: 'Rejected', tone: 'danger' },
  clarification_requested: { label: 'Host asked a question', tone: 'warning' },
};

export default function GoalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const detail = useSessionDetail(id);
  if (detail.isLoading) return <Screen><Header title="Goals" /><Loading /></Screen>;
  if (!detail.data) return <Screen><Header title="Goals" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  // remount the form when the player's submission record changes (e.g. after review)
  const mine = detail.data.submissions.find((x) => x.user_id === userId);
  return <GoalsBody key={`${mine?.id ?? 'new'}-${mine?.status ?? ''}`} id={id} />;
}

function GoalsBody({ id }: { id: string }) {
  const { userId } = useAuth();
  const { colors } = useTheme();
  const detail = useSessionDetail(id);
  const { run, busy } = useAction([keys.session(id)]);
  const d = detail.data;
  const mine = d?.submissions.find((x) => x.user_id === userId);
  const [goals, setGoals] = useState(mine?.goals ?? 0);
  const [assists, setAssists] = useState(mine?.assists ?? 0);
  const [breakdownOn, setBreakdownOn] = useState(false);
  const [breakdown, setBreakdown] = useState<Record<string, { goals: number; assists: number }>>({});
  const [note, setNote] = useState(mine?.note ?? '');
  const [review, setReview] = useState<{ sub: GoalSubmission; action: SubmissionStatus } | null>(null);
  const [reviewGoals, setReviewGoals] = useState(0);
  const [reason, setReason] = useState('');
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const [recordGoals, setRecordGoals] = useState(0);

  const myFixtures = useMemo(() => {
    if (!d) return [];
    return d.fixtures.filter((f) => f.played).flatMap((f) => {
      const team = f.teams.find((t) => t.players.some((p) => p.user_id === userId));
      return team ? [{ id: f.id, number: f.number, teamScore: team.score ?? 0, teamName: team.name }] : [];
    });
  }, [d, userId]);

  if (detail.isLoading) return <Screen><Header title="Goals" /><Loading /></Screen>;
  if (!d) return <Screen><Header title="Goals" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;

  const s = d.session;
  const verified = d.me?.verification === 'verified' || (s.status === 'in_progress' && myFixtures.length > 0);
  const canSubmit = verified && (!mine || ['pending', 'clarification_requested'].includes(mine.status)) && ['in_progress', 'completed', 'finalised'].includes(s.status);
  const trackAssists = true;
  const nameOf = (uid: string) => d.attendance.find((a) => a.user_id === uid)?.profile;
  const pending = d.submissions.filter((x) => x.status === 'pending' || x.status === 'clarification_requested');
  const reviewable = pending.filter((x) => x.user_id !== userId);
  const submittedIds = new Set(d.submissions.map((x) => x.user_id));
  const missing = d.attendance.filter((a) => a.verification === 'verified' && !submittedIds.has(a.user_id) && a.user_id !== userId);
  const split = breakdownOn && myFixtures.length > 1;
  const per = (fid: string) => breakdown[fid] ?? { goals: 0, assists: 0 };
  // with a game-by-game split, the totals are simply the sum of the games
  const totalGoals = split ? myFixtures.reduce((a, f) => a + per(f.id).goals, 0) : goals;
  const totalAssists = split ? myFixtures.reduce((a, f) => a + per(f.id).assists, 0) : assists;
  const localError = validateGoalClaim(totalGoals, myFixtures.map((f) => f.teamScore),
    split ? myFixtures.map((f) => ({ goals: per(f.id).goals, assists: per(f.id).assists, teamScore: f.teamScore })) : undefined, totalAssists);
  const isHostSelf = d.isManager;

  const submit = () => run('submit', () => rpc('submit_goals', {
    p_session: id, p_goals: totalGoals, p_assists: totalAssists, p_note: note || null,
    p_breakdown: split ? myFixtures.map((f) => ({ fixture_id: f.id, goals: per(f.id).goals, assists: per(f.id).assists })) : null,
  }), isHostSelf ? 'Saved — your stats are updated' : totalGoals + totalAssists === 0 ? 'Recorded — none this time' : 'Submitted for host approval');

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="Goals & assists" subtitle={s.name} right={<ScreenHelp id="goals" />} />

      {!!verified && (
        <Card variant={!!mine && !canSubmit ? 'default' : 'highlight'}>
          <View style={{ gap: space.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h3">Your tally</Text>
              {!!mine && <Badge label={STATUS[mine.status].label} tone={STATUS[mine.status].tone} />}
            </Row>
            {!!mine && mine.status !== 'pending' && mine.status !== 'clarification_requested' ? (
              <Text>
                {plural(mine.approved_goals ?? mine.goals, 'goal')}{mine.approved_assists ? `, ${plural(mine.approved_assists, 'assist')}` : ''}
                {mine.status === 'corrected' ? ` (you claimed ${mine.goals})` : ''}
              </Text>
            ) : (
              <>
                {!split && (
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong">Goals</Text>
                  <Stepper size="lg" value={goals} onChange={setGoals} max={50} label="Goals" />
                </Row>
                )}
                {!!trackAssists && !split && (
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong">Assists</Text>
                    <Stepper value={assists} onChange={setAssists} max={50} label="Assists" />
                  </Row>
                )}
                {myFixtures.length > 1 && (
                  <View style={{ gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="small" tone="muted">Split by game (optional)</Text>
                      <Switch value={breakdownOn} onValueChange={setBreakdownOn} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Split goals by game" />
                    </Row>
                    {!!split && myFixtures.map((f) => (
                      <Card key={f.id} variant="alt">
                        <View style={{ gap: space.sm }}>
                          <Text variant="smallStrong">Game {f.number} · {f.teamName} scored {f.teamScore}</Text>
                          <Row style={{ justifyContent: 'space-between' }}>
                            <Text variant="small" tone="muted">Goals</Text>
                            <Stepper value={per(f.id).goals} max={f.teamScore} onChange={(v) => setBreakdown((b) => ({ ...b, [f.id]: { ...per(f.id), goals: v } }))} label={`Goals in game ${f.number}`} />
                          </Row>
                          {!!trackAssists && (
                            <Row style={{ justifyContent: 'space-between' }}>
                              <Text variant="small" tone="muted">Assists</Text>
                              <Stepper value={per(f.id).assists} max={f.teamScore} onChange={(v) => setBreakdown((b) => ({ ...b, [f.id]: { ...per(f.id), assists: v } }))} label={`Assists in game ${f.number}`} />
                            </Row>
                          )}
                        </View>
                      </Card>
                    ))}
                    {!!split && <Text variant="small">Total: {totalGoals} goal{totalGoals === 1 ? '' : 's'}{trackAssists ? `, ${totalAssists} assist${totalAssists === 1 ? '' : 's'}` : ''}</Text>}
                  </View>
                )}
                <Input label="Note for the host (optional)" value={note} onChangeText={setNote} placeholder="e.g. Two headers and a penalty" maxLength={280} />
                {!!localError && <Text variant="small" tone="danger">{localError}</Text>}
                <Button title={mine ? 'Update submission' : 'Submit'} size="lg" disabled={!canSubmit || !!localError} loading={busy === 'submit'} onPress={submit} />
                <Text variant="caption" tone="faint">
                  {isHostSelf
                    ? 'As host, your own goals are approved automatically. They’re still capped by the score and recorded in the session history.'
                    : 'Goals count once the host approves them. You can also do this later from your To-do list.'}
                </Text>
              </>
            )}
          </View>
        </Card>
      )}

      {!!d.isManager && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title={`To approve · ${reviewable.length}`} action={reviewable.filter((x) => x.status === 'pending').length > 1 ? 'Approve all' : undefined}
            onAction={() => run('bulk', () => rpc<number>('bulk_approve_goals', { p_session: id }), (n) => `${plural(n, 'claim')} approved`)} />
          {reviewable.length === 0 && <Text tone="muted" variant="small">No claims waiting. {pending.some((x) => x.user_id === userId) ? 'Your own claim needs another host or a teammate to approve it.' : ''}</Text>}
          {reviewable.map((sub) => {
            const p = nameOf(sub.user_id);
            return (
              <Card key={sub.id}>
                <View style={{ gap: space.md }}>
                  <Row gap={space.md}>
                    <Avatar uri={p?.avatar_url} name={p?.display_name} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{p?.display_name}</Text>
                      <Text variant="small" tone="muted">
                        {plural(sub.goals, 'goal')}{sub.assists ? ` · ${plural(sub.assists, 'assist')}` : ''}{sub.is_late ? ' · late claim' : ''}
                        {sub.fixture_breakdown?.length ? ` · ${sub.fixture_breakdown.map((b) => `G${d.fixtures.find((f) => f.id === b.fixture_id)?.number}: ${b.goals}${b.assists ? `+${b.assists}a` : ''}`).join(', ')}` : ''}
                      </Text>
                      {!!sub.note && <Text variant="small" tone="muted">“{sub.note}”</Text>}
                    </View>
                  </Row>
                  <Row gap={space.sm} wrap>
                    <Button title="Approve" size="sm" icon="checkmark" loading={busy === `ap-${sub.id}`} onPress={() => run(`ap-${sub.id}`, () => rpc('review_goal_submission', { p_submission: sub.id, p_action: 'approved' }), 'Approved')} />
                    <Button title="Correct" size="sm" variant="secondary" onPress={() => { setReview({ sub, action: 'corrected' }); setReviewGoals(sub.goals); setReason(''); }} />
                    <Button title="Ask" size="sm" variant="ghost" onPress={() => { setReview({ sub, action: 'clarification_requested' }); setReason(''); }} />
                    <Button title="Reject" size="sm" variant="danger" onPress={() => { setReview({ sub, action: 'rejected' }); setReason(''); }} />
                  </Row>
                </View>
              </Card>
            );
          })}
          {missing.length > 0 && s.status !== 'finalised' && (
            <>
              <SectionTitle title={`Not submitted · ${missing.length}`} />
              <Text variant="caption" tone="muted">They’ve been reminded. You can finalise without them (they count as 0) or record goals on their behalf.</Text>
              {missing.map((a) => (
                <Row key={a.user_id} gap={space.md}>
                  <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={32} />
                  <Text style={{ flex: 1 }}>{a.profile.display_name}</Text>
                  <Button title="Record" size="sm" variant="secondary" onPress={() => { setRecordFor(a.user_id); setRecordGoals(0); }} />
                </Row>
              ))}
            </>
          )}
        </View>
      )}

      {d.approvedGoals.length > 0 && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Approved scorers" />
          <Card padded={false}>
            {[...d.approvedGoals].sort((a, b) => b.goals - a.goals).filter((g) => g.goals > 0 || g.assists > 0).map((g, i) => (
              <Row key={g.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Text style={{ flex: 1 }}>{nameOf(g.user_id)?.display_name ?? 'Player'}</Text>
                <Text variant="bodyStrong">{g.goals} ⚽{g.assists ? `  ${g.assists} 🅰️` : ''}</Text>
              </Row>
            ))}
          </Card>
        </View>
      )}

      <Sheet visible={!!review} onClose={() => setReview(null)} title={review?.action === 'corrected' ? 'Correct goals' : review?.action === 'rejected' ? 'Reject claim' : 'Ask for clarification'}>
        {review?.action === 'corrected' && (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">Correct total</Text>
            <Stepper value={reviewGoals} onChange={setReviewGoals} label="Corrected goals" />
          </Row>
        )}
        <Input label={review?.action === 'rejected' ? 'Reason (optional)' : 'Explanation'} value={reason} onChangeText={setReason} multiline maxLength={280} />
        <Button title="Send" loading={busy === 'review'} onPress={async () => {
          if (!review) return;
          const ok = await run('review', () => rpc('review_goal_submission', { p_submission: review.sub.id, p_action: review.action, p_goals: review.action === 'corrected' ? reviewGoals : null, p_reason: reason || null }), 'Done');
          if (ok !== undefined) setReview(null);
        }} />
      </Sheet>

      <Sheet visible={!!recordFor} onClose={() => setRecordFor(null)} title={`Record for ${recordFor ? nameOf(recordFor)?.display_name : ''}`}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">Goals</Text>
          <Stepper value={recordGoals} onChange={setRecordGoals} label="Goals" />
        </Row>
        <Button title="Save" loading={busy === 'record'} onPress={async () => {
          const ok = await run('record', () => rpc('host_record_goals', { p_session: id, p_user: recordFor, p_goals: recordGoals, p_reason: 'Recorded by host' }), 'Recorded');
          if (ok !== undefined) setRecordFor(null);
        }} />
      </Sheet>
    </Screen>
  );
}
