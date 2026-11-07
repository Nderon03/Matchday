import React, { useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View, type HostInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar, Badge, Button, Card, Chip, ErrorState, Header, IconButton, Input, ListItem, Loading, Row, Screen, SectionTitle, Sheet, Text, useConfirm,
} from '@/components/ui';
import { PaymentBadge } from '@/components/football/PaymentBadge';
import { ResultCard } from '@/components/football/ResultCard';
import { shareViewAsImage } from '@/lib/share';
import { statusBadge } from '@/components/football/SessionCard';
import { keys, useSessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { useNow } from '@/hooks/useNow';
import { q, rpc } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { formatKickoff, formatPence, nameList, rating, timeUntil, plural } from '@/domain/format';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { removeSessionPlayer } from '@/features/removePlayer';
import { LateStatusCard, useLateStatus } from '@/features/FinesPanel';
import { usePriceLabel } from '@/hooks/useFees';
import { SettleUpCard, useGroupBalances, useMyOutstanding } from '@/features/SettleUp';
import { MatchVideos } from '@/features/MatchVideos';
import { downloadIcs, googleCalendarUrl, type CalendarEvent } from '@/features/calendar';
import { appLink } from '@/lib/links';
import type { RsvpStatus } from '@/types/db';
import { haptics } from '@/lib/haptics';
import { KickoffWeather } from '@/features/KickoffWeather';
import { ReliabilityChip, useReliability } from '@/features/Reliability';
import { SquadMeter } from '@/features/moments/SquadMeter';
import { TickBurst } from '@/features/moments/TickBurst';
import { MotmAnnouncement } from '@/features/moments/MotmAnnouncement';
import { CalendarSyncSheet } from '@/features/CalendarSync';
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const detail = useSessionDetail(id);
  // hosts see a warning next to players who often drop out or don't show
  const squadReliability = useReliability(detail.data?.isManager ? detail.data.attendance.filter((a) => ['confirmed', 'waitlisted'].includes(a.status)).map((a) => a.user_id) : []);
  const now = useNow();
  const { run, busy } = useAction([keys.session(id), keys.mySessions]);
  const qc = useQueryClient();
  // when I tapped "I'm in" this visit, so the card can celebrate it
  const [justIn, setJustIn] = useState(0);
  const [syncOpen, setSyncOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);
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
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  const notAttending = !!me && ['declined', 'unavailable', 'withdrawn'].includes(me.status);
  const votingOpen = s.status === 'completed' && !closedHere && (!s.voting_closes_at || new Date(s.voting_closes_at).getTime() > now);
  const canCheckIn = me?.status === 'confirmed' && !me.checked_in_at && ['scheduled', 'in_progress'].includes(s.status) && new Date(s.starts_at).getTime() - now < 3 * 3600_000;
  const waitPos = me?.status === 'waitlisted' ? groups.waitlisted.findIndex((w) => w.user_id === userId) + 1 : 0;
  // a place offered to me from the waiting list (last 24 hours before kick-off)
  const offerUntil = me?.status === 'waitlisted' && me.offer_expires_at && new Date(me.offer_expires_at).getTime() > now ? me.offer_expires_at : null;
  const hostName = d.host?.display_name.split(' ')[0] ?? 'the host';
  const showJustIn = me?.status === 'confirmed' && justIn > 0 && now - justIn < 60_000;

  const calendarEvent: CalendarEvent = {
    id: s.id,
    title: s.name,
    startsAt: s.starts_at,
    durationMinutes: s.duration_minutes,
    location: [s.venue, s.location, s.postcode].filter(Boolean).join(', ') || null,
    details: `MATCHDAY · ${s.format_size}-a-side\n${appLink(`/session/${s.id}`)}`,
  };
  // web: choose Google Calendar or a calendar file (Apple/Outlook); phones: Google Calendar
  const addToCalendar = () => {
    if (Platform.OS !== 'web') Linking.openURL(googleCalendarUrl(calendarEvent)).catch(() => undefined);
    else setCalendarOpen(true);
  };

  const respond = (r: RsvpStatus) => run(`rsvp-${r}`, () => rpc<string>('respond_to_session', { p_session: id, p_response: r }),
    (res) => {
      if (res === 'confirmed') { haptics.success(); setJustIn(Date.now()); }
      return res === 'confirmed' ? 'You’re in! ⚽' : res === 'waitlisted' ? 'Session full — you’re on the waiting list' : 'Response saved';
    });

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
  // the star saves this game's settings as a preset (Create → Presets); tap again to remove it
  const togglePreset = () => {
    if (s.template_id) {
      run('preset', async () => {
        await q(supabase.from('session_templates').delete().eq('id', s.template_id!));
        qc.invalidateQueries({ queryKey: ['templates'] });
      }, 'Preset removed');
    } else {
      haptics.success();
      run('preset', async () => {
        await rpc('save_session_as_template', { p_session: id, p_name: s.name, p_recurrence: 'none', p_auto: false });
        qc.invalidateQueries({ queryKey: ['templates'] });
      }, 'Saved as a preset · find it in Create');
    }
  };
  // drop-outs close 24 hours before kick-off; after that players message the host
  const dropoutsClosed = !!s.rsvp_deadline && now > new Date(s.rsvp_deadline).getTime();
  const releasePlayer = async (uid: string, name: string) => {
    if (await confirm({ title: `Let ${name} drop out?`, message: 'Use this when they’ve told you they can’t make it. Their place goes to the waiting list.', confirmLabel: 'Let them drop out' })) {
      run(`rel-${uid}`, () => rpc('release_session_player', { p_session: id, p_user: uid }), `${name} dropped out`);
    }
  };
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
        right={(
          <Row gap={4} style={{ alignItems: 'center' }}>
            <ScreenHelp id="session" />
            {!!d.isManager && s.host_id === userId && (
              <Spot id="session.preset"><IconButton icon={s.template_id ? 'star' : 'star-outline'} label={s.template_id ? 'Saved as a preset. Remove preset' : 'Save as a preset'}
                tone={s.template_id ? 'primary' : undefined} onPress={togglePreset} /></Spot>
            )}
            {!!d.isManager && ['scheduled', 'in_progress'].includes(s.status) && <Spot id="session.invite"><IconButton icon="person-add-outline" label="Invite players" onPress={() => router.push(`/session/${id}/invite`)} /></Spot>}
          </Row>
        )}
      />

      <Spot id="session.info"><Card>
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="overline" tone="primary">{s.format_size}-a-side · {s.mode === 'multi' ? plural(d.fixtures.length, 'game') : 'single match'}</Text>
            {statusBadge(s, me?.status)}
          </Row>
          <View style={{ gap: 6 }}>
            <Row gap={8}>
              <Ionicons name="time-outline" size={17} color={colors.textMuted} />
              <Text style={{ flex: 1 }}>{formatKickoff(s.starts_at)} · {s.duration_minutes} min</Text>
              {['scheduled', 'in_progress'].includes(s.status) && (
                <Text variant="smallStrong" tone="primary" accessibilityRole="button" onPress={() => addToCalendar()}>Add to calendar</Text>
              )}
            </Row>
            {(s.venue || s.location || s.postcode) && (
              <Row gap={8}>
                <Ionicons name="location-outline" size={17} color={colors.textMuted} />
                <Text style={{ flex: 1 }}>{[s.venue, s.location, s.postcode].filter(Boolean).join(' · ')}</Text>
                {/* opens Google Maps (app or website) searching the venue the host typed */}
                <Text variant="smallStrong" tone="primary" accessibilityRole="link"
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.venue, s.postcode ?? s.location].filter(Boolean).join(', '))}`)}>
                  Directions
                </Text>
              </Row>
            )}
            <KickoffWeather sessionId={s.id} startsAt={s.starts_at} hasPlace={s.latitude != null} active={['scheduled', 'in_progress'].includes(s.status)} />
            <SquadMeter confirmed={groups.confirmed.length + guestsIn.length} max={s.max_attendance}
              label={`confirmed${guestsIn.length ? ` (incl. ${guestsIn.length} guest${guestsIn.length > 1 ? 's' : ''})` : ''}${groups.waitlisted.length ? ` · ${groups.waitlisted.length} waiting` : ''}`} />
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
      </Card></Spot>

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
        <Spot id="session.rsvp"><Card variant={me?.status === 'confirmed' || offerUntil ? 'highlight' : 'default'} style={notAttending ? { borderColor: colors.danger } : undefined}>
          <View style={{ gap: space.md }}>
            {showJustIn && (
              <View style={{ alignItems: 'center', marginTop: -space.sm, marginBottom: -space.md }}>
                <TickBurst key={justIn} size={52} />
              </View>
            )}
            <Text variant="h3" align={showJustIn ? 'center' : undefined}>
              {me?.status === 'confirmed' ? (showJustIn ? 'You’re in! ⚽' : 'You’re playing') : offerUntil ? 'A place just opened for you' : me?.status === 'waitlisted' ? `Waiting list · position ${waitPos}` : blocked ? 'Removed by the host' : reinvited ? 'The host invited you back — are you in?' : notAttending ? 'You’re not attending' : 'Are you in?'}
            </Text>
            {me?.status === 'confirmed' ? (
              <Row gap={space.sm} wrap>
                {!!canCheckIn && <Button title="Check in" icon="checkmark-circle-outline" loading={busy === 'checkin'} onPress={() => run('checkin', () => rpc('check_in', { p_session: id }), 'Checked in — see you on the pitch')} />}
                {!!me.checked_in_at && <Badge label="Checked in" tone="success" align="center" />}
                {!dropoutsClosed && <Button title="Can’t make it" variant="secondary" loading={busy === 'rsvp-withdrawn'} onPress={async () => {
                  const guestsNote = myGuests.length ? ` Your guest${myGuests.length > 1 ? 's' : ''} will be removed too.` : '';
                  if (await confirm({ title: 'Can’t make it anymore?', message: `Your place goes to the next player on the waiting list.${guestsNote} You can rejoin later if there’s space.`, confirmLabel: 'I can’t make it', destructive: true })) respond('withdrawn');
                }} />}
                {dropoutsClosed && s.host_id !== userId && !me.dropout_requested_at && (
                  <Button title="Can’t make it" variant="secondary" loading={busy === 'dropout'} onPress={async () => {
                    const r = await confirm({ title: `Tell ${hostName} you can’t make it?`, message: `Drop-outs closed 24 hours before kick-off, so ${hostName} takes you off. They’ll get a notification straight away.`,
                      confirmLabel: `Tell ${hostName}`, reasonLabel: 'Message (optional)' });
                    if (r) run('dropout', () => rpc('request_dropout', { p_session: id, p_message: typeof r === 'object' ? r.reason || null : null }), `${hostName} has been told`);
                  }} />
                )}
                <Button title="Add a guest" icon="person-add-outline" variant="ghost" onPress={() => { setGuestName(''); setGuestOpen(true); }} />
              </Row>
            ) : offerUntil ? (
              <View style={{ gap: space.sm }}>
                <Text variant="small" tone="muted">
                  Someone dropped out. It’s yours if you tap “I’m in” in the next {timeUntil(offerUntil, now)}, then it goes to the next player.
                </Text>
                <Row gap={space.sm} wrap>
                  <Button title="I’m in" icon="checkmark-circle-outline" loading={busy === 'rsvp-confirmed'} onPress={() => respond('confirmed')} />
                  <Button title="Can’t make it" variant="secondary" loading={busy === 'rsvp-withdrawn'} onPress={() => respond('withdrawn')} />
                </Row>
              </View>
            ) : me?.status === 'waitlisted' ? (
              <Button title="Leave waiting list" variant="secondary" onPress={() => respond('withdrawn')} />
            ) : blocked ? null : (
              <View style={{ gap: space.md }}>
                {!!notAttending && (
                  <Row gap={space.sm}>
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                    <Text variant="small" tone="muted" style={{ flex: 1 }}>
                      {me!.status === 'unavailable' ? 'You marked yourself unavailable.' : me!.status === 'withdrawn' ? 'You dropped out of this session.' : 'You said you can’t make it.'}
                      {' '}The host and squad can see this. Changed your mind? You can still join below.
                    </Text>
                  </Row>
                )}
                {owedBills.length > 0 ? (
                  <SettleUpCard bills={owedBills} />
                ) : (
                  <Row gap={space.sm} wrap>
                    <Button title={groups.confirmed.length + guestsIn.length >= s.max_attendance ? 'Join waiting list' : notAttending ? 'Actually, I’m in' : 'I’m in'} icon="checkmark" loading={busy === 'rsvp-confirmed'} onPress={() => respond('confirmed')} />
                    {me?.status !== 'declined' && me?.status !== 'withdrawn' && <Button title="Can’t make it" variant="secondary" loading={busy === 'rsvp-declined'} onPress={() => respond('declined')} />}
                  </Row>
                )}
              </View>
            )}
            {me?.status === 'confirmed' && s.host_id !== userId && (
              <Text variant="caption" tone="muted">
                {me.dropout_requested_at ? `You told ${hostName} you can’t make it. You’re still in the squad until they take you off.`
                  : dropoutsClosed ? `Drop-outs closed 24 hours before kick-off. Tap “Can’t make it” to tell ${hostName}.`
                  : `You can drop out until ${formatKickoff(s.rsvp_deadline ?? s.starts_at)}. After that, you tell the host instead.`}
              </Text>
            )}

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
        </Card></Spot>
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

      <MatchVideos detail={d} now={now} />

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

      {s.status === 'finalised' && !!userId && (
        <MotmAnnouncement sessionId={s.id} finalisedAt={s.finalised_at ?? null} userId={userId}
          winners={d.motm.filter((m) => !m.fixture_id).map((m) => ({ user_id: m.user_id, name: nameOf(m.user_id), avatar: d.attendance.find((a) => a.user_id === m.user_id)?.profile.avatar_url ?? null, votes: m.votes }))} />
      )}
      {s.status === 'finalised' && (
        <View style={{ gap: space.sm }}>
          <ResultCard
            ref={resultRef}
            data={{
              name: s.name, date: s.starts_at, formatSize: s.format_size,
              fixtures: d.fixtures.map((f) => ({ number: f.number, a: f.teams[0]?.name ?? 'A', b: f.teams[1]?.name ?? 'B', scoreA: f.teams[0]?.score ?? null, scoreB: f.teams[1]?.score ?? null })),
              groupName: d.group?.name ?? null,
              motm: d.motm.filter((m) => !m.fixture_id).map((m) => nameOf(m.user_id)),
              topScorers: [...d.approvedGoals].filter((g) => g.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 4).map((g) => ({ name: nameOf(g.user_id), goals: g.goals })),
              topAssists: [...d.approvedGoals].filter((g) => g.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 3).map((g) => ({ name: nameOf(g.user_id), assists: g.assists })),
              me: (() => {
                const st = d.stats.find((x: any) => x.user_id === userId);
                if (!st) return null;
                const mine = d.approvedGoals.find((g) => g.user_id === userId);
                return { rating: st.rating_eligible && st.rating_avg !== null ? Number(st.rating_avg) : null, goals: mine?.goals ?? 0, assists: mine?.assists ?? 0, motm: !!st.motm };
              })(),
            }}
          />
          <Button title="Share match report" icon="share-social-outline" size="sm"
            onPress={() => shareViewAsImage(resultRef, `matchday-${s.id}`, `${s.name}: ${d.fixtures.map((f) => `${f.teams[0]?.score}-${f.teams[1]?.score}`).join(', ')} on MATCHDAY`).catch(() => undefined)} />
          <SectionTitle title="Man of the Match" />
          {d.motm.length ? d.motm.filter((m) => !m.fixture_id).map((m) => (
            <Card key={m.user_id} onPress={() => router.push(`/player/${m.user_id}`)} variant="highlight">
              <Row gap={space.md}>
                <Avatar uri={d.attendance.find((a) => a.user_id === m.user_id)?.profile.avatar_url} name={nameOf(m.user_id)} size={48} ring={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{nameOf(m.user_id)}</Text>
                  <Text variant="small" tone="muted">{plural(m.votes, 'vote')}{m.shared ? ' · shared award' : ''}</Text>
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

      {/* Host panel: the one thing to do next, everything else in a list */}
      {!!d.isManager && s.status !== 'cancelled' && (() => {
        const next = d.fixtures.find((f) => !f.played) ?? d.fixtures[d.fixtures.length - 1];
        const teamsReady = !!next?.lineup_confirmed_at;
        const step: { title: string; detail: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean } | null =
          s.status === 'scheduled' && !teamsReady ? { title: 'Pick the teams', detail: 'Balance the squad and announce the line-ups.', icon: 'shirt', onPress: () => router.push(`/session/${id}/lineup`) }
          : ['scheduled', 'in_progress'].includes(s.status) ? { title: 'Full time: enter the scores', detail: 'Record each game’s score to open voting.', icon: 'flag', onPress: () => router.push(`/session/${id}/results`) }
          : s.status === 'completed' && pendingClaims ? { title: `Approve ${plural(pendingClaims, 'goal claim')}`, detail: 'Results can’t be finalised until every claim is decided.', icon: 'checkmark-done', onPress: () => router.push(`/session/${id}/goals`) }
          : s.status === 'completed' && votingOpen ? { title: 'Close voting now', detail: `Voting closes in ${timeUntil(s.voting_closes_at!)}; results finalise automatically then.`, icon: 'timer-outline', onPress: () => run('close', async () => { await rpc('close_voting', { p_session: id }); setClosedHere(true); return true; }, 'Voting closed: you can finalise now') }
          : s.status === 'completed' ? { title: 'Finalise results', detail: 'Publishes the result and updates everyone’s stats.', icon: 'lock-closed', onPress: openFinalise }
          : null;
        return (
          <View style={{ gap: space.sm }}>
            <SectionTitle title="Host controls" />
            <Spot id="session.host"><Card>
              <View style={{ gap: space.md }}>
                {!!step && (
                  <View style={{ gap: space.xs }}>
                    <Button title={step.title} icon={step.icon} size="lg" loading={busy === 'close'} onPress={step.onPress} />
                    <Text variant="caption" tone="muted" align="center">{step.detail}</Text>
                  </View>
                )}
                <Button title="More host tools" icon="ellipsis-horizontal" variant="secondary" onPress={() => setToolsOpen(true)} />
              </View>
            </Card></Spot>
          </View>
        );
      })()}

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
        <Spot id="session.squad"><SectionTitle title={`Squad · ${groups.confirmed.length + guestsIn.length}`} action={squadOpen ? 'Hide' : 'See squad'} onAction={() => setSquadOpen((o) => !o)} /></Spot>
        {!squadOpen && (
          <Card onPress={() => setSquadOpen(true)} accessibilityLabel="See the full squad">
            {groups.confirmed.length + guestsIn.length === 0 ? (
              <Text tone="muted">No one has confirmed yet.</Text>
            ) : (
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[...groups.confirmed.map((a) => ({ key: a.user_id, name: a.profile.display_name, uri: a.profile.avatar_url })), ...guestsIn.map((g) => ({ key: g.id, name: g.name, uri: null }))]
                    .slice(0, 12).map((x, i) => (
                      <View key={x.key} style={{ marginLeft: i ? -8 : 0, borderRadius: 999, borderWidth: 2, borderColor: colors.surface }}>
                        <Avatar uri={x.uri} name={x.name} size={34} />
                      </View>
                    ))}
                </View>
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {nameList([...groups.confirmed.map((a) => a.profile.display_name.split(' ')[0]), ...guestsIn.map((g) => `${g.name} (guest)`)], 4)}
                </Text>
              </View>
            )}
          </Card>
        )}
        {squadOpen && (
          <Card padded={false}>
          {groups.confirmed.map((a, i) => (
            <Row key={a.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" onPress={() => router.push(`/player/${a.user_id}`)}>{a.profile.display_name}{a.user_id === s.host_id ? ' · host' : ''}</Text>
                <Text variant="caption" tone="muted">@{a.profile.username}{a.checked_in_at ? ' · checked in' : ''}{a.late_arrival ? ' · late' : ''}</Text>
                {!!d.isManager && (squadReliability.data?.[a.user_id]?.pct ?? 100) < 90 && <ReliabilityChip r={squadReliability.data?.[a.user_id]} />}
              </View>
              {a.verification === 'verified' && <Ionicons name="shield-checkmark" size={16} color={colors.primary} accessibilityLabel="Verified" />}
              {a.verification === 'absent' && <Badge label="Absent" tone="danger" />}
              {s.payment_mode !== 'free' && a.user_id !== s.host_id && <PaymentBadge status={payments.get(a.user_id)} />}
              {!!balances.data?.get(a.user_id) && <Badge label={`owes ${formatPence(balances.data.get(a.user_id)!)}`} tone="warning" align="center" />}
              {!!d.isManager && a.user_id !== s.host_id && ['scheduled', 'in_progress'].includes(s.status) && (
                <>
                  {s.status === 'scheduled' && dropoutsClosed && (
                    <IconButton icon="exit-outline" label={`Let ${a.profile.display_name} drop out`} size={32} onPress={() => releasePlayer(a.user_id, a.profile.display_name)} />
                  )}
                  <IconButton icon="person-remove-outline" label={`Remove ${a.profile.display_name}`} size={32} tone="danger" onPress={() => removePlayer(a.user_id, a.profile.display_name)} />
                </>
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
        )}
        {!!d.isManager && s.status === 'scheduled' && groups.confirmed.filter((a) => a.dropout_requested_at).map((a) => (
          <Card key={`drop-${a.user_id}`} variant="alt">
            <Row gap={space.md}>
              <Avatar uri={a.profile.avatar_url} name={a.profile.display_name} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{a.profile.display_name} can’t make it</Text>
                <Text variant="caption" tone="muted">Their place goes to the waiting list</Text>
              </View>
              <Button title="Let them drop out" size="sm" loading={busy === `rel-${a.user_id}`}
                onPress={() => run(`rel-${a.user_id}`, () => rpc('release_session_player', { p_session: id, p_user: a.user_id }), `${a.profile.display_name} dropped out`)} />
            </Row>
          </Card>
        ))}
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

      <Sheet visible={toolsOpen} onClose={() => setToolsOpen(false)} title="Host tools">
        <ScrollView style={{ maxHeight: 460 }}>
          {[
            s.status !== 'finalised' && { icon: 'shirt-outline', title: 'Line-ups', go: `/session/${id}/lineup` },
            s.status !== 'finalised' && { icon: 'football-outline', title: 'Scores', go: `/session/${id}/results` },
            s.status !== 'scheduled' && { icon: 'checkmark-done-outline', title: `Goals${pendingClaims ? ` · ${pendingClaims} to approve` : ''}`, go: `/session/${id}/goals` },
            s.status !== 'finalised' && { icon: 'checkbox-outline', title: 'Attendance', go: `/session/${id}/attendance` },
            s.payment_mode !== 'free' && { icon: 'card-outline', title: 'Payments', go: `/session/${id}/payments` },
            ['scheduled', 'in_progress'].includes(s.status) && { icon: 'create-outline', title: 'Edit details', go: `/session/${id}/edit` },
            s.status === 'finalised' && { icon: 'construct-outline', title: 'Make a correction', go: `/session/${id}/results?correct=1` },
          ].filter(Boolean).map((t: any) => (
            <ListItem key={t.title} title={t.title} left={<Ionicons name={t.icon} size={20} color={colors.textMuted} />} onPress={() => { setToolsOpen(false); router.push(t.go); }} />
          ))}
          {['scheduled', 'in_progress'].includes(s.status) && (
            <ListItem title="Cancel session" danger left={<Ionicons name="close-circle-outline" size={20} color={colors.danger} />} onPress={async () => {
              setToolsOpen(false);
              const r = await confirm({ title: 'Cancel this session?', message: 'Everyone will be notified and any payments refunded or released.', confirmLabel: 'Cancel session', cancelLabel: 'Keep it', destructive: true, reasonLabel: 'Reason (optional, shown to players)' });
              if (r) run('cancel', () => rpc('cancel_session', { p_session: id, p_reason: typeof r === 'object' && r.reason ? r.reason : null }), 'Session cancelled');
            }} />
          )}
        </ScrollView>
      </Sheet>
      <CalendarSyncSheet visible={syncOpen} onClose={() => setSyncOpen(false)} />
      <Sheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} title="Add to calendar">
        <Text tone="muted">Includes the venue, a link back to this session and a reminder 2 hours before kick-off (calendar file).</Text>
        <Button title="Google Calendar" icon="logo-google" onPress={() => { window.open(googleCalendarUrl(calendarEvent), '_blank'); setCalendarOpen(false); }} />
        <Button title="Apple Calendar / Outlook (.ics file)" icon="calendar-outline" variant="secondary" onPress={() => { downloadIcs(calendarEvent); setCalendarOpen(false); }} />
        <Button title="Sync all my games instead" icon="sync-outline" variant="ghost" onPress={() => { setCalendarOpen(false); setSyncOpen(true); }} />
      </Sheet>

      <Sheet visible={guestOpen} onClose={() => setGuestOpen(false)} title="Bring a guest">
        <Text tone="muted">For someone without a MATCHDAY account. They take a squad spot and can be picked in line-ups, but don’t get stats or votes.</Text>
        {s.payment_mode !== 'free' && s.price_pence > 0 && s.host_id !== userId && (
          <Card variant="alt">
            <Row gap={space.sm}>
              <Ionicons name="card-outline" size={18} color={colors.warning} />
              <Text variant="small" style={{ flex: 1 }}>
                You pay for your guests: {formatPence(s.price_pence)} each, added to your bill so it’s one payment
                {s.payment_mode === 'upfront' ? ' before the game' : ' after the game'}. If you’ve already paid, the guest fee is billed separately.
                Unpaid guest fees stop you joining the next game, like any other bill.
              </Text>
            </Row>
          </Card>
        )}
        <Input label="Guest’s name" value={guestName} onChangeText={setGuestName} placeholder="e.g. Dave (Sam’s brother)" maxLength={40} autoFocus />
        <Button title={s.payment_mode !== 'free' && s.price_pence > 0 && s.host_id !== userId ? `Add guest · ${formatPence(s.price_pence)}` : 'Add guest'} icon="person-add" disabled={!guestName.trim()} loading={busy === 'guest'} onPress={async () => {
          const r = await run('guest', () => rpc<{ status: string }>('add_session_guest', { p_session: id, p_name: guestName }),
            (x) => (x.status === 'pending' ? 'Request sent to the host' : `${guestName.trim()} added`));
          if (r) setGuestOpen(false);
        }} />
      </Sheet>

      <Sheet visible={finaliseOpen} onClose={() => setFinaliseOpen(false)} title="Finalise results">
        <Text tone="muted">This publishes the results, awards MOTM and updates everyone’s statistics. Later changes need an audited correction.</Text>
        {pendingClaims > 0 && <Text tone="danger">{plural(pendingClaims, 'goal claim')} still {pendingClaims === 1 ? 'needs' : 'need'} a decision.</Text>}
        {tied.length > 1 && (
          <View style={{ gap: space.sm }}>
            <Text variant="bodyStrong">MOTM is tied on {plural(top, 'vote')}</Text>
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
