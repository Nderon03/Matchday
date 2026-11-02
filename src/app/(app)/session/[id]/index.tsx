import React, { useMemo, useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar, Badge, Button, Card, Chip, Divider, ErrorState, Header, IconButton, Input, Loading, Row, Screen, SectionTitle, Sheet, Text, useConfirm,
} from '@/components/ui';
import { PaymentBadge } from '@/components/football/PaymentBadge';
import { ResultCard } from '@/components/football/ResultCard';
import { shareViewAsImage } from '@/lib/share';
import { statusBadge } from '@/components/football/SessionCard';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { useNow } from '@/hooks/useNow';
import { rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { formatKickoff, formatPence, rating, timeUntil } from '@/domain/format';
import { sameWeekdayNextWeek } from '@/features/sessionDates';
import { removeSessionPlayer } from '@/features/removePlayer';
import { LateStatusCard, useLateStatus } from '@/features/FinesPanel';
import { usePriceLabel } from '@/hooks/useFees';
import { SettleUpCard, useGroupBalances, useMyOutstanding } from '@/features/SettleUp';
import type { RsvpStatus } from '@/types/db';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const detail = useSessionDetail(id);
  const now = useNow();
  const { run, busy } = useAction([keys.session(id), keys.mySessions]);
  const [finaliseOpen, setFinaliseOpen] = useState(false);
  // set when the host closes voting here, so Finalise unlocks immediately (the clock only ticks every 30s)
  const [closedHere, setClosedHere] = useState(false);
  const [tally, setTally] = useState<{ user_id: string; votes: number }[] | null>(null);
  const [tiebreak, setTiebreak] = useState<string | null>(null);
  const resultRef = useRef<HostInstance>(null);
  const confirm = useConfirm();
  const price = usePriceLabel();
  const lateStatus = useLateStatus(detail.data?.session.group_id, detail.data?.session.payment_mode !== 'free');
  const outstanding = useMyOutstanding(detail.data?.session.group_id, detail.data?.session.status === 'scheduled');
  const balances = useGroupBalances(detail.data?.session.group_id, !!detail.data?.isManager);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');

  const d = detail.data;
  const groups = useMemo(() => {
    if (!d) return null;
    const by = (s: RsvpStatus) => d.attendance.filter((a) => a.status === s);
    const responded = new Set(d.attendance.map((a) => a.user_id));
    return {
      confirmed: by('confirmed'),
      waitlisted: by('waitlisted').sort((a, b) => (a.waitlisted_at ?? '').localeCompare(b.waitlisted_at ?? '')),
      out: d.attendance.filter((a) => ['declined', 'unavailable', 'withdrawn', 'removed'].includes(a.status)),
      pending: d.invited.filter((p) => !responded.has(p.id)),
    };
  }, [d]);

  if (detail.isLoading) return <Screen><Header title="Session" /><Loading /></Screen>;
  if (!d || !groups) return <Screen><Header title="Session" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;

  const s = d.session;
  const me = d.me;
  const payments = new Map(d.payments.map((p) => [p.user_id, p.status]));
  const myPayment = payments.get(userId!);
  const nameOf = (uid: string) => d.attendance.find((a) => a.user_id === uid)?.profile.display_name ?? 'Player';
  const pendingClaims = d.submissions.filter((x) => x.status === 'pending').length;
  const verified = me?.verification === 'verified';
  const votingOpen = s.status === 'completed' && !closedHere && (!s.voting_closes_at || new Date(s.voting_closes_at).getTime() > now);
  const canCheckIn = me?.status === 'confirmed' && !me.checked_in_at && ['scheduled', 'in_progress'].includes(s.status) && new Date(s.starts_at).getTime() - now < 3 * 3600_000;
  const waitPos = me?.status === 'waitlisted' ? groups.waitlisted.findIndex((w) => w.user_id === userId) + 1 : 0;

  const respond = (r: RsvpStatus) => run(`rsvp-${r}`, () => rpc<string>('respond_to_session', { p_session: id, p_response: r }),
    (res) => (res === 'confirmed' ? 'You’re in! ⚽' : res === 'waitlisted' ? 'Session full — you’re on the waiting list' : 'Response saved'));

  const openFinalise = async () => {
    setFinaliseOpen(true);
    try {
      const t = await rpc<{ user_id: string; fixture_id: string | null; votes: number }[]>('get_motm_tally', { p_session: id });
      setTally(t.filter((x) => !x.fixture_id));
    } catch {
      setTally(null);
    }
  };
  const top = tally?.length ? tally[0].votes : 0;
  const tied = tally?.filter((t) => t.votes === top) ?? [];

  const scores = d.fixtures.filter((f) => f.played);
  // who scored / assisted in each game (null = totals not broken down by game)
  const scorersFor = (fixtureId: string | null) => {
    const rows = d.goalsByFixture.filter((g) => g.fixture_id === fixtureId && (g.goals > 0 || g.assists > 0));
    if (!rows.length) return '';
    return rows.sort((a, b) => b.goals - a.goals)
      .map((g) => `${nameOf(g.user_id)}${g.goals ? ` ⚽${g.goals > 1 ? `×${g.goals}` : ''}` : ''}${g.assists ? ` 🅰️${g.assists > 1 ? `×${g.assists}` : ''}` : ''}`)
      .join('  ·  ');
  };
  const guestsIn = d.guests.filter((g) => g.status === 'confirmed');
  // unpaid bills from earlier games in this group (not this one) block joining
  const owedBills = (outstanding.data ?? []).filter((b) => b.session_id !== id);
  // a removed player who has been invited again can rejoin like anyone else
  const reinvited = me?.status === 'removed' && d.invited.some((p) => p.id === userId);
  const blocked = me?.status === 'removed' && !reinvited;
  const guestRequests = d.guests.filter((g) => g.status === 'pending');
  const myGuests = d.guests.filter((g) => g.added_by === userId && (g.status === 'confirmed' || g.status === 'pending'));
  const removePlayer = (uid: string, name: string) => removeSessionPlayer({ confirm, run, sessionId: id, userId: uid, name, guests: d.guests });
  const removeGuest = async (gid: string, name: string, mine: boolean) => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: mine ? 'Your guest will be taken out of the squad.' : 'The player who added them will need to send a request to bring another guest.',
      confirmLabel: 'Remove', destructive: true,
    });
    if (ok) run(`rmg-${gid}`, () => rpc('remove_session_guest', { p_guest: gid }), `${name} removed`);
  };
  const totals = scores.reduce((acc, f) => ({ A: acc.A + (f.teams[0]?.score ?? 0), B: acc.B + (f.teams[1]?.score ?? 0) }), { A: 0, B: 0 });

  return (
    <Screen edges={['top', 'bottom']} onRefresh={detail.refetch} refreshing={detail.isRefetching}>
      <Header
        title={s.name}
        subtitle={d.group?.name ?? `${s.format_size}-a-side`}
        right={!!d.isManager && ['scheduled', 'in_progress'].includes(s.status) ? <IconButton icon="person-add-outline" label="Invite players" onPress={() => router.push(`/session/${id}/invite`)} /> : undefined}
      />

      <Card>
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="overline" tone="primary">{s.format_size}-a-side · {s.mode === 'multi' ? `${d.fixtures.length} games` : 'single match'}</Text>
            {statusBadge(s, me?.status)}
          </Row>
          <View style={{ gap: 6 }}>
            <Row gap={8}><Ionicons name="time-outline" size={17} color={colors.textMuted} /><Text>{formatKickoff(s.starts_at)} · {s.duration_minutes} min</Text></Row>
            {(s.venue || s.location) && <Row gap={8}><Ionicons name="location-outline" size={17} color={colors.textMuted} /><Text style={{ flex: 1 }}>{[s.venue, s.location].filter(Boolean).join(' · ')}</Text></Row>}
            <Row gap={8}><Ionicons name="people-outline" size={17} color={colors.textMuted} /><Text>{groups.confirmed.length + guestsIn.length}/{s.max_attendance} confirmed{guestsIn.length ? ` (incl. ${guestsIn.length} guest${guestsIn.length > 1 ? 's' : ''})` : ''}{groups.waitlisted.length ? ` · ${groups.waitlisted.length} waiting` : ''}</Text></Row>
            {s.payment_mode !== 'free' && (
              <Row gap={8} style={{ alignItems: 'flex-start' }}>
                <Ionicons name="card-outline" size={17} color={colors.textMuted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text>{price(s.price_pence).total} per player · {s.payment_mode === 'upfront' ? 'pay upfront' : 'pay after'}</Text>
                  {!!price(s.price_pence).detail && <Text variant="caption" tone="muted">{price(s.price_pence).breakdown}</Text>}
                </View>
              </Row>
            )}
            {!!d.host && <Row gap={8}><Avatar uri={d.host.avatar_url} name={d.host.display_name} size={20} /><Text tone="muted">Hosted by {d.host.display_name}</Text></Row>}
          </View>
          {!!s.description && <Text tone="muted" variant="small">{s.description}</Text>}
        </View>
      </Card>

      {!!blocked && (
        <Card style={{ borderColor: colors.danger, backgroundColor: colors.dangerMuted }}>
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="person-remove" size={24} color={colors.danger} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h3" color={colors.danger}>You’ve been removed from this session</Text>
              {me?.removed_reason ? <Text>Reason: {me.removed_reason}</Text> : null}
              <Text variant="small" tone="muted">You can only rejoin if the host invites you again.</Text>
            </View>
          </Row>
        </Card>
      )}

      {s.status === 'scheduled' && s.payment_mode !== 'free' && !!lateStatus.data?.enabled && <LateStatusCard status={lateStatus.data} />}

      {/* Player actions */}
      {s.status === 'scheduled' && (
        <Card variant={me?.status === 'confirmed' ? 'highlight' : 'default'}>
          <View style={{ gap: space.md }}>
            <Text variant="h3">
              {me?.status === 'confirmed' ? 'You’re playing' : me?.status === 'waitlisted' ? `Waiting list · position ${waitPos}` : blocked ? 'Removed by the host' : reinvited ? 'The host invited you back — are you in?' : me && ['declined', 'unavailable', 'withdrawn'].includes(me.status) ? 'You’re not playing' : 'Are you in?'}
            </Text>
            {me?.status === 'confirmed' ? (
              <Row gap={space.sm} wrap>
                {!!canCheckIn && <Button title="Check in" icon="checkmark-circle-outline" loading={busy === 'checkin'} onPress={() => run('checkin', () => rpc('check_in', { p_session: id }), 'Checked in — see you on the pitch')} />}
                {!!me.checked_in_at && <Badge label="Checked in" tone="success" align="center" />}
                <Button title="Withdraw" variant="secondary" loading={busy === 'rsvp-withdrawn'} onPress={async () => {
                  if (await confirm({ title: 'Withdraw from this session?', message: 'Your place goes to the next player on the waiting list.', confirmLabel: 'Withdraw', destructive: true })) respond('withdrawn');
                }} />
                <Button title="Add a guest" icon="person-add-outline" variant="ghost" onPress={() => { setGuestName(''); setGuestOpen(true); }} />
              </Row>
            ) : me?.status === 'waitlisted' ? (
              <Button title="Leave waiting list" variant="secondary" onPress={() => respond('withdrawn')} />
            ) : blocked ? null : owedBills.length > 0 ? (
              <SettleUpCard bills={owedBills} />
            ) : (
              <Row gap={space.sm} wrap>
                <Button title={groups.confirmed.length + guestsIn.length >= s.max_attendance ? 'Join waiting list' : 'I’m in'} icon="checkmark" loading={busy === 'rsvp-confirmed'} onPress={() => respond('confirmed')} />
                <Button title="Can’t make it" variant="secondary" loading={busy === 'rsvp-declined'} onPress={() => respond('declined')} />
                <Button title="Unavailable" variant="ghost" onPress={() => respond('unavailable')} />
              </Row>
            )}
            {!!s.rsvp_deadline && <Text variant="caption" tone="muted">Withdrawals close {formatKickoff(s.rsvp_deadline)}</Text>}

            {myGuests.length > 0 && (
              <View style={{ gap: space.xs }}>
                {myGuests.map((g) => (
                  <Row key={g.id} gap={space.sm}>
                    <Ionicons name="person-outline" size={15} color={colors.textMuted} />
                    <Text variant="small" style={{ flex: 1 }}>{g.name} · {g.status === 'pending' ? 'waiting for host approval' : 'your guest'}</Text>
                    <Text variant="smallStrong" tone="danger" accessibilityRole="button" onPress={() => removeGuest(g.id, g.name, true)}>Remove</Text>
                  </Row>
                ))}
              </View>
            )}
          </View>
        </Card>
      )}

      {s.payment_mode !== 'free' && me && me.user_id !== s.host_id && (me.status === 'confirmed' || myPayment) && (
        <Card onPress={() => router.push(`/session/${id}/payments`)}>
          <Row gap={space.md}>
            <PaymentBadge status={myPayment} size={24} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{myPayment === 'paid' ? 'Paid' : myPayment === 'authorised' ? 'Pending · charged after the game' : `${price(s.price_pence).total} due`}</Text>
              <Text variant="small" tone="muted">{myPayment === 'paid' ? 'Thanks! Receipt in payments.' : 'Tap to pay by card, Apple Pay or Google Pay'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Row>
        </Card>
      )}

      {s.status === 'completed' && verified && (
        <Row gap={space.sm}>
          <Card onPress={() => router.push(`/session/${id}/vote`)} variant="highlight" style={{ flex: 1 }}>
            <Ionicons name="star" size={22} color={colors.gold} />
            <Text variant="bodyStrong" style={{ marginTop: 6 }}>Vote & rate</Text>
            <Text variant="caption" tone="muted">{!!votingOpen && s.voting_closes_at ? `Closes in ${timeUntil(s.voting_closes_at)}` : 'Voting closed'}</Text>
          </Card>
          <Card onPress={() => router.push(`/session/${id}/goals`)} style={{ flex: 1 }}>
            <Ionicons name="football" size={22} color={colors.primary} />
            <Text variant="bodyStrong" style={{ marginTop: 6 }}>My goals</Text>
            <Text variant="caption" tone="muted">{d.submissions.find((x) => x.user_id === userId)?.status ?? 'Not submitted'}</Text>
          </Card>
        </Row>
      )}

      {/* Results */}
      {scores.length > 0 && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title={s.mode === 'multi' ? `Results · ${totals.A}–${totals.B} on aggregate` : 'Result'} action={!!d.isManager && s.status !== 'finalised' ? 'Edit' : undefined} onAction={() => router.push(`/session/${id}/results`)} />
          <Card padded={false}>
            {d.fixtures.map((f, i) => (
              <View key={f.id} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="small" tone="muted" style={{ width: 64 }}>{s.mode === 'multi' ? `Game ${f.number}` : 'FT'}</Text>
                  <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{f.teams[0]?.name}</Text>
                  <Text variant="statSmall" style={{ width: 72, textAlign: 'center' }}>{f.played ? `${f.teams[0]?.score} – ${f.teams[1]?.score}` : 'vs'}</Text>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{f.teams[1]?.name}</Text>
                </Row>
                {!!(scorersFor(f.id)) && <Text variant="caption" tone="muted" style={{ paddingLeft: 64 }}>{scorersFor(f.id)}</Text>}
              </View>
            ))}
          </Card>
          {!!(scorersFor(null)) && <Text variant="caption" tone="muted">Across the session: {scorersFor(null)}</Text>}
        </View>
      )}

      {s.status === 'finalised' && (
        <View style={{ gap: space.sm }}>
          <ResultCard
            ref={resultRef}
            data={{
              name: s.name, date: s.starts_at, formatSize: s.format_size,
              fixtures: d.fixtures.map((f) => ({ number: f.number, a: f.teams[0]?.name ?? 'A', b: f.teams[1]?.name ?? 'B', scoreA: f.teams[0]?.score ?? null, scoreB: f.teams[1]?.score ?? null })),
              motm: d.motm.filter((m) => !m.fixture_id).map((m) => nameOf(m.user_id)),
              topScorers: [...d.approvedGoals].filter((g) => g.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 3).map((g) => ({ name: nameOf(g.user_id), goals: g.goals })),
            }}
          />
          <Button title="Share result" icon="share-social-outline" variant="secondary" size="sm"
            onPress={() => shareViewAsImage(resultRef, `matchday-${s.id}`, `${s.name}: ${d.fixtures.map((f) => `${f.teams[0]?.score}-${f.teams[1]?.score}`).join(', ')} on MATCHDAY`).catch(() => undefined)} />
          <SectionTitle title="Man of the Match" />
          {d.motm.length ? d.motm.filter((m) => !m.fixture_id).map((m) => (
            <Card key={m.user_id} onPress={() => router.push(`/player/${m.user_id}`)} variant="highlight">
              <Row gap={space.md}>
                <Avatar uri={d.attendance.find((a) => a.user_id === m.user_id)?.profile.avatar_url} name={nameOf(m.user_id)} size={48} ring={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{nameOf(m.user_id)}</Text>
                  <Text variant="small" tone="muted">{m.votes} votes{m.shared ? ' · shared award' : ''}</Text>
                </View>
                <Ionicons name="star" size={26} color={colors.gold} />
              </Row>
            </Card>
          )) : <Text tone="muted" variant="small">No MOTM — no votes were cast.</Text>}
          {d.motm.some((m) => m.fixture_id) && (
            <Text variant="small" tone="muted">Per game: {d.fixtures.map((f) => `G${f.number}: ${d.motm.filter((m) => m.fixture_id === f.id).map((m) => nameOf(m.user_id)).join(' & ') || '–'}`).join(' · ')}</Text>
          )}
          <SectionTitle title="Player ratings" />
          <Card padded={false}>
            {[...d.stats].sort((a, b) => Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0)).map((st, i) => (
              <Row key={st.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Avatar uri={d.attendance.find((a) => a.user_id === st.user_id)?.profile.avatar_url} name={nameOf(st.user_id)} size={32} />
                <Text variant="bodyStrong" style={{ flex: 1 }} onPress={() => router.push(`/player/${st.user_id}`)}>{nameOf(st.user_id)}</Text>
                {st.goals > 0 && <Text variant="small" tone="muted">{st.goals} ⚽</Text>}
                {!!st.motm && <Ionicons name="star" size={16} color={colors.gold} />}
                <Text variant="statSmall" tone={st.rating_eligible ? 'primary' : 'faint'} style={{ width: 44, textAlign: 'right' }}>{st.rating_eligible ? rating(st.rating_avg) : '–'}</Text>
              </Row>
            ))}
          </Card>
        </View>
      )}

      {/* Host panel */}
      {!!d.isManager && s.status !== 'cancelled' && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Host controls" />
          <Card>
            <View style={{ gap: space.sm }}>
              {s.status !== 'finalised' && (
                <Row gap={space.sm} wrap>
                  <Button title="Line-ups" icon="shirt-outline" variant="secondary" size="sm" onPress={() => router.push(`/session/${id}/lineup`)} />
                  <Button title="Scores" icon="football-outline" variant="secondary" size="sm" onPress={() => router.push(`/session/${id}/results`)} />
                  <Button title="Attendance" icon="checkbox-outline" variant="secondary" size="sm" onPress={() => router.push(`/session/${id}/attendance`)} />
                  {['scheduled', 'in_progress'].includes(s.status) && <Button title="Edit" icon="create-outline" variant="secondary" size="sm" onPress={() => router.push(`/session/${id}/edit`)} />}
                </Row>
              )}
              <Row gap={space.sm} wrap>
                {s.status !== 'scheduled' && <Button title={`Goals${pendingClaims ? ` · ${pendingClaims} to approve` : ''}`} icon="checkmark-done-outline" variant={pendingClaims ? 'primary' : 'secondary'} size="sm" onPress={() => router.push(`/session/${id}/goals`)} />}
                {s.payment_mode !== 'free' && <Button title="Payments" icon="card-outline" variant="secondary" size="sm" onPress={() => router.push(`/session/${id}/payments`)} />}
                <Button title="Repeat next week" icon="repeat" variant="secondary" size="sm" loading={busy === 'dup'} onPress={() => run('dup', async () => {
                  const newId = await rpc<string>('duplicate_session', { p_session: id, p_starts_at: sameWeekdayNextWeek(s.starts_at).toISOString() });
                  router.push(`/session/${newId}`);
                }, 'Next week’s session created')} />
                {!s.template_id && <Button title="Save template" icon="bookmark-outline" variant="ghost" size="sm" onPress={() => run('tpl', () => rpc('save_session_as_template', { p_session: id, p_name: s.name, p_recurrence: 'none', p_auto: false }), 'Saved as a template')} />}
              </Row>
              {['scheduled', 'in_progress'].includes(s.status) && (
                <>
                  <Divider />
                  <Button title="Full time — complete session" icon="flag" loading={busy === 'complete'} onPress={() => router.push(`/session/${id}/results`)} />
                </>
              )}
              {s.status === 'completed' && (
                <>
                  <Divider />
                  <Text variant="small" tone="muted">
                    {votingOpen ? `Voting closes in ${timeUntil(s.voting_closes_at!)}. Results finalise automatically when it closes (if all goal claims are resolved).` : 'Voting has closed. Finalise to publish the results and update statistics.'}
                  </Text>
                  <Row gap={space.sm} wrap>
                    {!!votingOpen && <Button title="Close voting now" variant="secondary" size="sm" loading={busy === 'close'} onPress={async () => {
                      const ok = await run('close', async () => { await rpc('close_voting', { p_session: id }); return true; }, 'Voting closed — you can finalise now');
                      if (ok) setClosedHere(true);
                    }} />}
                    <Button title="Finalise results" icon="lock-closed" size="sm" disabled={votingOpen} onPress={openFinalise} />
                  </Row>
                </>
              )}
              {s.status === 'finalised' && (
                <Button title="Make a correction" icon="construct-outline" variant="ghost" size="sm" onPress={() => router.push(`/session/${id}/results?correct=1`)} />
              )}
              {['scheduled', 'in_progress'].includes(s.status) && (
                <Button title="Cancel session" variant="danger" size="sm" onPress={async () => {
                  const r = await confirm({ title: 'Cancel this session?', message: 'Everyone will be notified and any payments refunded or released.', confirmLabel: 'Cancel session', cancelLabel: 'Keep it', destructive: true, reasonLabel: 'Reason (optional, shown to players)' });
                  if (r) run('cancel', () => rpc('cancel_session', { p_session: id, p_reason: typeof r === 'object' && r.reason ? r.reason : null }), 'Session cancelled');
                }} />
              )}
            </View>
          </Card>
        </View>
      )}

      {/* Line-ups status for players */}
      {!d.isManager && d.me?.status === 'confirmed' && ['scheduled', 'in_progress'].includes(s.status) && (() => {
        const next = d.fixtures.find((f) => !f.played) ?? d.fixtures[d.fixtures.length - 1];
        const ready = !!next && (!!next.lineup_confirmed_at || s.status !== 'scheduled');
        const myTeam = ready ? next.teams.find((t) => t.players.some((p) => p.user_id === userId)) : undefined;
        return (
          <Card onPress={() => router.push(`/session/${id}/lineup${next ? `?fixture=${next.id}` : ''}`)} variant={ready ? 'highlight' : 'alt'}>
            <Row gap={space.md}>
              <Ionicons name={ready ? 'shirt' : 'hourglass-outline'} size={22} color={ready ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{ready ? 'Line-ups are in' : 'Waiting for line-ups'}</Text>
                <Text variant="caption" tone="muted">
                  {ready
                    ? myTeam ? `You're on ${myTeam.name}${myTeam.players.find((p) => p.user_id === userId)?.is_substitute ? ' (sub)' : ''}. Tap to see the teams.` : 'Tap to see the teams.'
                    : "The host hasn't announced the teams yet. We'll notify you."}
                </Text>
              </View>
              {ready && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
            </Row>
          </Card>
        );
      })()}

      {/* Squad */}
      <View style={{ gap: space.sm }}>
        <SectionTitle title={`Squad · ${groups.confirmed.length}`} action="Line-ups" onAction={() => router.push(`/session/${id}/lineup`)} />
        <Card padded={false}>
          {groups.confirmed.map((a, i) => (
            <Row key={a.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" onPress={() => router.push(`/player/${a.user_id}`)}>{a.profile.display_name}{a.user_id === s.host_id ? ' · host' : ''}</Text>
                <Text variant="caption" tone="muted">@{a.profile.username}{a.checked_in_at ? ' · checked in' : ''}{a.late_arrival ? ' · late' : ''}</Text>
              </View>
              {a.verification === 'verified' && <Ionicons name="shield-checkmark" size={16} color={colors.primary} accessibilityLabel="Verified" />}
              {a.verification === 'absent' && <Badge label="Absent" tone="danger" />}
              {s.payment_mode !== 'free' && a.user_id !== s.host_id && <PaymentBadge status={payments.get(a.user_id)} />}
              {!!balances.data?.get(a.user_id) && <Badge label={`owes ${formatPence(balances.data.get(a.user_id)!)}`} tone="warning" align="center" />}
              {!!d.isManager && a.user_id !== s.host_id && ['scheduled', 'in_progress'].includes(s.status) && (
                <IconButton icon="person-remove-outline" label={`Remove ${a.profile.display_name}`} size={32} tone="danger" onPress={() => removePlayer(a.user_id, a.profile.display_name)} />
              )}
            </Row>
          ))}
          {guestsIn.map((g) => (
            <Row key={g.id} gap={space.md} style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Avatar name={g.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{g.name}</Text>
                <Text variant="caption" tone="muted">Guest of {nameOf(g.added_by ?? '')} · no account</Text>
              </View>
              <Badge label="Guest" align="center" />
              {(d.isManager || g.added_by === userId) && ['scheduled', 'in_progress'].includes(s.status) && (
                <IconButton icon="person-remove-outline" label={`Remove ${g.name}`} size={32} tone="danger" onPress={() => removeGuest(g.id, g.name, g.added_by === userId)} />
              )}
            </Row>
          ))}
          {!groups.confirmed.length && <Text tone="muted" style={{ padding: space.lg }}>No one has confirmed yet.</Text>}
        </Card>
        {!!d.isManager && guestRequests.map((g) => (
          <Card key={g.id} variant="alt">
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Guest request: {g.name}</Text>
                <Text variant="caption" tone="muted">From {nameOf(g.added_by ?? '')}</Text>
              </View>
              <Button title="Approve" size="sm" loading={busy === `ga-${g.id}`} onPress={() => run(`ga-${g.id}`, () => rpc('decide_guest_request', { p_guest: g.id, p_approve: true }), `${g.name} added`)} />
              <Button title="Decline" size="sm" variant="ghost" onPress={() => run(`gd-${g.id}`, () => rpc('decide_guest_request', { p_guest: g.id, p_approve: false }))} />
            </Row>
          </Card>
        ))}
        {groups.waitlisted.length > 0 && <Text variant="small" tone="muted">Waiting list: {groups.waitlisted.map((w, i) => `${i + 1}. ${w.profile.display_name}`).join(', ')}</Text>}
        {groups.pending.length > 0 && <Text variant="small" tone="muted">Awaiting reply: {groups.pending.map((p) => p.display_name).join(', ')}</Text>}
        {groups.out.length > 0 && <Text variant="small" tone="faint">Not playing: {groups.out.map((p) => p.profile.display_name).join(', ')}</Text>}
      </View>

      <Sheet visible={guestOpen} onClose={() => setGuestOpen(false)} title="Bring a guest">
        <Text tone="muted">For someone without a MATCHDAY account. They take a squad spot and can be picked in line-ups, but don’t get stats or votes.</Text>
        <Input label="Guest’s name" value={guestName} onChangeText={setGuestName} placeholder="e.g. Dave (Sam’s brother)" maxLength={40} autoFocus />
        <Button title="Add guest" icon="person-add" disabled={!guestName.trim()} loading={busy === 'guest'} onPress={async () => {
          const r = await run('guest', () => rpc<{ status: string }>('add_session_guest', { p_session: id, p_name: guestName }),
            (x) => (x.status === 'pending' ? 'Request sent to the host' : `${guestName.trim()} added`));
          if (r) setGuestOpen(false);
        }} />
      </Sheet>

      <Sheet visible={finaliseOpen} onClose={() => setFinaliseOpen(false)} title="Finalise results">
        <Text tone="muted">This publishes the results, awards MOTM and updates everyone’s statistics. Later changes need an audited correction.</Text>
        {pendingClaims > 0 && <Text tone="danger">{pendingClaims} goal claim(s) still need a decision.</Text>}
        {tied.length > 1 && (
          <View style={{ gap: space.sm }}>
            <Text variant="bodyStrong">MOTM is tied on {top} votes</Text>
            <Text variant="small" tone="muted">Share the award, or pick a winner as host.</Text>
            <Row gap={space.sm} wrap>
              <Chip label="Share it" selected={!tiebreak} onPress={() => setTiebreak(null)} />
              {tied.map((t) => <Chip key={t.user_id} label={nameOf(t.user_id)} selected={tiebreak === t.user_id} onPress={() => setTiebreak(t.user_id)} />)}
            </Row>
          </View>
        )}
        <Button title="Finalise" icon="lock-closed" loading={busy === 'finalise'} onPress={async () => {
          const r = await run('finalise', () => rpc('finalise_session', { p_session: id, p_motm_tiebreak: tiebreak }), 'Results published! 🏆');
          if (r !== undefined) setFinaliseOpen(false);
        }} />
      </Sheet>
    </Screen>
  );
}
