import React, { useMemo, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, ErrorState, Header, Input, Loading, Row, Screen, Segmented, Sheet, Text, useConfirm, useToast } from '@/components/ui';
import { Pitch, type LineupPlayer } from '@/components/football/Pitch';
import { lineupOps, type LineupState, type Zone } from '@/domain/lineup';
import { suggestTeams, randomTeams, balanceTeams, hasEnoughHistory, type BalancePlayer, type BalanceResult, type GoalkeeperMode } from '@/domain/balancing';
import { keys, useSessionDetail, type SessionDetail } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { space } from '@/theme/tokens';
import type { PlayerPosition } from '@/types/db';
import { POSITION_LABEL } from '@/domain/format';
import { removeSessionPlayer } from '@/features/removePlayer';
import { TeamsReveal } from '@/features/moments/TeamsReveal';
import { useAuth } from '@/providers/AuthProvider';
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

type Strengths = { players: BalancePlayer[]; pairings: { user_a: string; user_b: string; times: number }[] };

function buildSuggestion(kind: 'balanced' | 'random', pool: BalancePlayer[], pairings: Strengths['pairings'], goalkeepers: GoalkeeperMode = 'auto'): BalanceResult {
  if (kind === 'random') return randomTeams(pool, undefined, goalkeepers);
  return hasEnoughHistory(pool) ? balanceTeams(pool, { recentPairings: pairings, goalkeepers }) : suggestTeams(pool, { goalkeepers });
}

/** Players see a game's teams once the host confirms them (or once the session has kicked off). */
function lineupPublished(session: SessionDetail['session'], fixture: SessionDetail['fixtures'][number]) {
  return !!fixture.lineup_confirmed_at || fixture.played || session.status !== 'scheduled';
}

export default function LineupScreen() {
  const { id, fixture: fixtureParam, auto } = useLocalSearchParams<{ id: string; fixture?: string; auto?: 'balanced' | 'random' }>();
  const detail = useSessionDetail(id);
  const { userId } = useAuth();
  const d = detail.data;
  const [fixtureId, setFixtureId] = useState<string | null>(fixtureParam ?? null);
  const strengths = useQuery({
    queryKey: ['strengths', id],
    enabled: !!d, // everyone viewing the line-up sees positions and ratings
    queryFn: async (): Promise<Strengths> => {
      const [s, p] = await Promise.all([
        rpc<BalancePlayer[]>('get_player_strengths', { p_session: id }),
        rpc<Strengths['pairings']>('get_recent_pairings', { p_session: id }),
      ]);
      return { players: s, pairings: p };
    },
  });
  if (detail.isLoading || (auto && d?.isManager && strengths.isLoading)) return <Screen><Header title="Line-ups" /><Loading /></Screen>;
  const fixture = d?.fixtures.find((f) => f.id === fixtureId) ?? d?.fixtures.find((f) => !f.played) ?? d?.fixtures[d.fixtures.length - 1];
  if (!d || !fixture) return <Screen><Header title="Line-ups" /><ErrorState error={detail.error} onRetry={detail.refetch} /></Screen>;
  // the editor remounts when switching game or when someone else saves a new line-up
  const savedSig = fixture.teams.map((t) => `${t.name}:${t.players.map((p) => `${p.user_id ?? p.guest_id}${p.is_goalkeeper ? 'g' : ''}${p.is_substitute ? 's' : ''}`).join(',')}`).join('|');
  return (
    <>
    {!!userId && <TeamsReveal detail={d} fixture={fixture} userId={userId} />}
    <LineupEditor
      key={`${fixture.id}-${savedSig}`}
      id={id}
      detail={d}
      fixture={fixture}
      strengths={strengths.data}
      strengthsLoading={strengths.isLoading}
      auto={fixture.id === fixtureParam && !fixture.played ? auto : undefined}
      onSelectFixture={setFixtureId}
    />
    </>
  );
}

function LineupEditor({ id, detail: d, fixture, strengths, strengthsLoading, auto, onSelectFixture }: {
  id: string;
  detail: SessionDetail;
  fixture: SessionDetail['fixtures'][number];
  strengths?: Strengths;
  strengthsLoading: boolean;
  auto?: 'balanced' | 'random';
  onSelectFixture: (id: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run, busy } = useAction([keys.session(id)]);
  const players = useMemo(() => {
    const map: Record<string, LineupPlayer> = {};
    for (const a of d.attendance) {
      if (a.status === 'confirmed' && a.verification !== 'absent') map[a.user_id] = { user_id: a.user_id, ...a.profile };
    }
    for (const g of d.guests) {
      if (g.status === 'confirmed') map[`guest:${g.id}`] = { user_id: `guest:${g.id}`, display_name: g.name, username: g.name, avatar_url: null, position: 'ANY', isGuest: true };
    }
    return map;
  }, [d]);
  // guests have no history, so the balancer treats them as an average (6.0) player
  const withGuests = (pool: BalancePlayer[]): BalancePlayer[] => [
    ...pool,
    ...Object.values(players).filter((p) => p.isGuest).map((p) => ({ user_id: p.user_id, position: 'ANY' as PlayerPosition })),
  ];
  const positions = Object.fromEntries(Object.values(players).map((p) => [p.user_id, p.position])) as Record<string, PlayerPosition>;
  const savedLineup = (): LineupState => {
    const toSlots = (side: 0 | 1) =>
      [...(fixture.teams[side]?.players ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((p) => ({ user_id: p.user_id ?? `guest:${p.guest_id}`, position: p.position, is_goalkeeper: p.is_goalkeeper, is_substitute: p.is_substitute }));
    return { A: toSlots(0), B: toSlots(1) };
  };
  const initialSuggestion = (() => {
    const saved = savedLineup();
    if (!auto || !strengths || saved.A.length || saved.B.length) return null;
    const pool = withGuests(strengths.players.filter((p) => players[p.user_id]));
    return pool.length >= 2 ? buildSuggestion(auto, pool, strengths.pairings) : null;
  })();
  const [suggestion, setSuggestion] = useState<BalanceResult | null>(initialSuggestion);
  const [lineup, setLineup] = useState<LineupState>(() =>
    initialSuggestion ? lineupOps.fromAssignment(initialSuggestion.A, initialSuggestion.B, positions, initialSuggestion.goalkeepers, d.session.format_size) : savedLineup());
  const [names, setNames] = useState({ A: fixture.teams[0]?.name ?? 'Team A', B: fixture.teams[1]?.name ?? 'Team B' });
  const [dirty, setDirty] = useState(!!initialSuggestion);
  const [selected, setSelected] = useState<string | null>(null);
  const [gkMode, setGkMode] = useState<GoalkeeperMode>('auto');
  const { colors } = useTheme();
  // players who chose Goalkeeper as their preferred position (guests count as outfield)
  const keeperNames = Object.values(players).filter((p) => p.position === 'GK' && !p.isGuest).map((p) => p.display_name);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const editable = d.isManager && d.session.status !== 'finalised' && !(fixture.played && d.session.status === 'completed');
  const published = lineupPublished(d.session, fixture);
  const confirmed = !!fixture.lineup_confirmed_at;
  const ratings = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const p of strengths?.players ?? []) {
      const r = p.group_rating ?? p.career_rating;
      map[p.user_id] = r == null ? null : Number(r);
    }
    return map;
  }, [strengths]);
  const assigned = new Set([...lineup.A, ...lineup.B].map((s) => s.user_id));
  const bench = Object.keys(players).filter((uid) => !assigned.has(uid));
  const payments = Object.fromEntries(d.payments.map((p) => [p.user_id, p.status]));

  const update = (next: LineupState) => {
    setLineup(next);
    setDirty(true);
  };

  const apply = (kind: 'balanced' | 'random') => {
    const pool = withGuests((strengths?.players ?? []).filter((p) => players[p.user_id]));
    if (pool.length < 2) return toast.show('You need at least two confirmed players.', 'error');
    const result = buildSuggestion(kind, pool, strengths?.pairings ?? [], gkMode);
    setSuggestion(result);
    update(lineupOps.fromAssignment(result.A, result.B, positions, result.goalkeepers, d.session.format_size));
  };

  const save = (confirm: boolean) =>
    run('save', async () => {
      // guests are stored by guest_id; registered players by user_id
      const toJson = (side: 'A' | 'B') => ({
        name: names[side],
        players: lineup[side].map((s) => (s.user_id.startsWith('guest:') ? { ...s, user_id: null, guest_id: s.user_id.slice(6) } : s)),
      });
      await rpc('save_lineup', { p_fixture: fixture.id, p_teams: { A: toJson('A'), B: toJson('B') }, p_confirm: confirm });
      setDirty(false);
    }, !confirm ? 'Draft saved — only hosts can see it' : fixture.lineup_confirmed_at ? 'Teams updated — players notified' : 'Line-ups confirmed — players notified');

  const onTap = (uid: string) => {
    if (!editable) return;
    if (swapFrom && swapFrom !== uid) {
      update(lineupOps.swap(lineup, swapFrom, uid));
      setSwapFrom(null);
      return;
    }
    setSelected(uid);
  };
  const sel = selected ? players[selected] : null;
  const selSide: Zone = selected ? (lineup.A.some((s) => s.user_id === selected) ? 'A' : lineup.B.some((s) => s.user_id === selected) ? 'B' : 'bench') : 'bench';
  const selSlot = [...lineup.A, ...lineup.B].find((s) => s.user_id === selected);

  return (
    <Screen edges={['top', 'bottom']} scrollEnabled={scrollEnabled} maxWidth={640}
      footer={editable ? (
        confirmed ? (
          // once announced, every save is visible to players, so there is no draft step
          <Button title={dirty ? 'Update teams' : 'Confirmed ✓'} disabled={!dirty} loading={busy === 'save'} onPress={() => save(true)} />
        ) : (
          <Row gap={space.sm}>
            <Button title="Save draft" variant="secondary" style={{ flex: 1 }} disabled={!dirty} loading={busy === 'save'} onPress={() => save(false)} />
            <Button title="Confirm teams" style={{ flex: 1.4 }} loading={busy === 'save'} onPress={() => save(true)} />
          </Row>
        )
      ) : undefined}
    >
      <Header title="Line-ups" subtitle={`${d.session.format_size}-a-side · ${Object.keys(players).length} confirmed`} right={<ScreenHelp id="lineup" />} />

      {d.fixtures.length > 1 && (
        <Segmented scroll value={fixture.id} onChange={onSelectFixture} options={d.fixtures.map((f) => ({ value: f.id, label: `Game ${f.number}${f.played ? ' ✓' : ''}` }))} />
      )}

      {!d.isManager && !published ? (
        <Card>
          <EmptyState
            icon="hourglass-outline"
            title="Waiting for line-ups"
            message={d.me?.status === 'confirmed'
              ? "You're in. The host hasn't announced the teams yet — we'll notify you as soon as they do."
              : "The host hasn't announced the teams yet. Confirm your place to be picked."}
          />
        </Card>
      ) : null}

      {!!editable && !confirmed && !fixture.played && (
        <Card variant="alt">
          <Row gap={space.sm}>
            <Text variant="small" style={{ flex: 1 }}>
              {d.session.status === 'scheduled'
                ? 'Draft — players can\'t see these teams until you tap Confirm teams.'
                : 'Not confirmed yet — players can see these teams because the session has started.'}
            </Text>
          </Row>
        </Card>
      )}

      {!!editable && (
        <View style={{ gap: space.sm }}>
          <Row gap={space.sm} wrap>
            <Spot id="lineup.balance"><Button title="Balance teams" icon="analytics-outline" size="sm" loading={strengthsLoading} onPress={() => apply('balanced')} /></Spot>
            <Button title="Randomise" icon="shuffle" size="sm" variant="secondary" onPress={() => apply('random')} />
            <Button title="Clear" size="sm" variant="ghost" onPress={() => { update({ A: [], B: [] }); setSuggestion(null); }} />
          </Row>
          <Card variant="alt">
            <View style={{ gap: space.sm }}>
              <Row gap={space.sm}>
                <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
                <Text variant="smallStrong" style={{ flex: 1 }}>
                  {keeperNames.length === 0 ? 'No goalkeepers today'
                    : `${keeperNames.length} goalkeeper${keeperNames.length > 1 ? 's' : ''}: ${keeperNames.join(', ')}`}
                </Text>
              </Row>
              <Text variant="caption" tone="muted">
                {gkMode === 'rotating' || keeperNames.length === 0 ? 'Both teams rotate in goal. Teams are balanced on ratings and positions.'
                  : keeperNames.length === 1 ? 'They go on one team and the other team rotates in goal, so it gets an extra defender and a slightly stronger squad.'
                  : keeperNames.length === 2 ? 'One goalkeeper on each team.'
                  : 'The best two go in goal, one on each team. The others play outfield.'}
              </Text>
              {keeperNames.length > 0 && (
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="small" style={{ flex: 1 }}>Keepers play outfield today (everyone rotates)</Text>
                  <Switch value={gkMode === 'rotating'} onValueChange={(v) => setGkMode(v ? 'rotating' : 'auto')}
                    trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Keepers play outfield today" />
                </Row>
              )}
              <Text variant="caption" tone="faint">Goalkeepers are players whose preferred position is Goalkeeper. Tap Balance teams after changing this.</Text>
            </View>
          </Card>
          {!!suggestion && (
            <Card variant="alt">
              <Text variant="small">{suggestion.explanation}</Text>
              {suggestion.method === 'balanced' && (
                <Text variant="caption" tone="muted">Expected strength {suggestion.strengthA.toFixed(1)} vs {suggestion.strengthB.toFixed(1)}. Nothing is final until you confirm.</Text>
              )}
            </Card>
          )}
          {!!swapFrom && <Text variant="smallStrong" tone="warning">Tap another player to swap with {players[swapFrom]?.display_name}.</Text>}
          <Text variant="caption" tone="faint">Drag players between teams and the bench, or tap a player for more options.</Text>
        </View>
      )}

      {(d.isManager || published) && <Pitch
        players={players}
        lineup={lineup}
        bench={bench}
        editable={editable}
        teamNames={names}
        teamColours={{ A: fixture.teams[0]?.colour ?? '#22C55E', B: fixture.teams[1]?.colour ?? '#F5F5F5' }}
        payments={payments}
        showPayments={d.session.payment_mode !== 'free'}
        exemptFromPayment={d.session.host_id}
        ratings={ratings}
        selected={swapFrom ?? selected}
        onTapPlayer={onTap}
        onMove={(uid, to) => update(lineupOps.move(lineup, uid, to, d.session.format_size))}
        onDragState={(dragging) => setScrollEnabled(!dragging)}
      />}

      {!!editable && (
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label="Team A name" value={names.A} onChangeText={(v) => { setNames((n) => ({ ...n, A: v })); setDirty(true); }} maxLength={24} /></View>
          <View style={{ flex: 1 }}><Input label="Team B name" value={names.B} onChangeText={(v) => { setNames((n) => ({ ...n, B: v })); setDirty(true); }} maxLength={24} /></View>
        </Row>
      )}

      <Sheet visible={!!sel} onClose={() => setSelected(null)} title={sel?.display_name ?? ''}>
        <ScrollView contentContainerStyle={{ gap: space.sm }}>
          <Row gap={space.sm} wrap>
            {selSide !== 'A' && <Chip label={`Move to ${names.A}`} onPress={() => { update(lineupOps.move(lineup, selected!, 'A', d.session.format_size)); setSelected(null); }} />}
            {selSide !== 'B' && <Chip label={`Move to ${names.B}`} onPress={() => { update(lineupOps.move(lineup, selected!, 'B', d.session.format_size)); setSelected(null); }} />}
            {selSide !== 'bench' && <Chip label="Send to bench" onPress={() => { update(lineupOps.move(lineup, selected!, 'bench', d.session.format_size)); setSelected(null); }} />}
          </Row>
          {selSide !== 'bench' && (
            <Row gap={space.sm} wrap>
              <Chip label={selSlot?.is_goalkeeper ? 'Remove goalkeeper' : 'Make goalkeeper'} selected={selSlot?.is_goalkeeper} onPress={() => { update(lineupOps.setGoalkeeper(lineup, selected!)); setSelected(null); }} />
              <Chip label={selSlot?.is_substitute ? 'Make starter' : 'Make substitute'} selected={selSlot?.is_substitute} onPress={() => { update(lineupOps.toggleSub(lineup, selected!)); setSelected(null); }} />
            </Row>
          )}
          <Text variant="smallStrong" tone="muted">{selSide === 'bench' ? 'Move them onto a team to set a position' : 'Position'}</Text>
          <Row gap={space.sm} wrap>
            {(['GK', 'DEF', 'MID', 'FWD', 'ANY'] as PlayerPosition[]).map((p) => (
              <Chip key={p} label={POSITION_LABEL[p]} selected={p === 'GK' ? !!selSlot?.is_goalkeeper : !selSlot?.is_goalkeeper && selSlot?.position === p} onPress={() => {
                if (selSide === 'bench' || !selected) return;
                update(lineupOps.setPosition(lineup, selected, p));
                setSelected(null);
              }} />
            ))}
          </Row>
          <Button title="Swap with another player" variant="secondary" icon="swap-horizontal" onPress={() => { setSwapFrom(selected); setSelected(null); }} />
          {!!selected && selected !== d.session.host_id && ['scheduled', 'in_progress'].includes(d.session.status) && (
            <Button
              title={sel?.isGuest ? 'Remove guest from session' : 'Remove from session'}
              variant="danger"
              icon="person-remove-outline"
              onPress={async () => {
                const target = selected;
                const name = sel?.display_name ?? 'player';
                setSelected(null);
                if (target.startsWith('guest:')) {
                  const ok = await confirm({ title: `Remove ${name}?`, message: 'The player who added them will need to request another guest.', confirmLabel: 'Remove', destructive: true });
                  if (ok) await run('remove', () => rpc('remove_session_guest', { p_guest: target.slice(6) }), `${name} removed`);
                } else {
                  await removeSessionPlayer({ confirm, run, sessionId: id, userId: target, name, guests: d.guests });
                }
              }}
            />
          )}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
