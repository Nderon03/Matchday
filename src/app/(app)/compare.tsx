import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, EmptyState, ErrorState, Header, Input, ListItem, Loading, Row, Screen, SectionTitle, Sheet, SwipeSelect, Text } from '@/components/ui';
import { q, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useFriends, useMyGroups, type PublicProfile } from '@/hooks/queries';
import { formatDate, rating, plural } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

function Bar({ label, a, b, format = (v: number) => String(v), lowerIsBetter }: { label: string; a: number; b: number; format?: (v: number) => string; lowerIsBetter?: boolean }) {
  const { colors } = useTheme();
  const total = Math.max(a + b, 0.0001);
  const aWins = lowerIsBetter ? a < b : a > b;
  const bWins = lowerIsBetter ? b < a : b > a;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${format(a)} versus ${format(b)}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="statSmall" tone={aWins ? 'primary' : 'default'}>{format(a)}</Text>
        <Text variant="caption" tone="muted">{label}</Text>
        <Text variant="statSmall" tone={bWins ? 'primary' : 'default'}>{format(b)}</Text>
      </Row>
      <View style={{ flexDirection: 'row', height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.surfaceAlt, gap: 2 }}>
        <View style={{ flex: a / total || 0.0001, backgroundColor: aWins ? colors.primary : colors.borderStrong }} />
        <View style={{ flex: b / total || 0.0001, backgroundColor: bWins ? colors.primary : colors.borderStrong }} />
      </View>
    </View>
  );
}

/**
 * One side of the VS header: tap to search for a player, or swipe sideways to flick through them.
 */
function Slot({ person, label, onOpen, onSwipe }: { person?: PublicProfile; label: string; onOpen: () => void; onSwipe: (dir: 1 | -1) => void }) {
  const { colors } = useTheme();
  const [start, setStart] = useState<number | null>(null);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={person ? `${label}: ${person.display_name}. Change` : `Pick ${label}`}
      onTouchStart={(e) => setStart(e.nativeEvent.pageX)}
      onTouchEnd={(e) => { if (start != null && Math.abs(e.nativeEvent.pageX - start) > 40) onSwipe(e.nativeEvent.pageX < start ? 1 : -1); setStart(null); }}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, paddingVertical: space.sm, borderRadius: radius.md, opacity: pressed ? 0.8 : 1 })}>
      {person ? <Avatar uri={person.avatar_url} name={person.display_name} size={64} /> : (
        <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="search" size={22} color={colors.textMuted} />
        </View>
      )}
      <Text variant="bodyStrong" numberOfLines={1}>{person ? person.display_name : 'Pick a player'}</Text>
      <Row gap={4}><Ionicons name="swap-horizontal" size={12} color={colors.textFaint} /><Text variant="caption" tone="faint">Tap or swipe</Text></Row>
    </Pressable>
  );
}

/** Search sheet for picking a player. */
function PickSheet({ visible, people, exclude, onPick, onClose }: { visible: boolean; people: PublicProfile[]; exclude?: string; onPick: (id: string) => void; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const list = people.filter((p) => p.id !== exclude && (!t || p.display_name.toLowerCase().includes(t) || p.username.toLowerCase().includes(t)));
  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a player">
      <Input value={term} onChangeText={setTerm} placeholder="Search by name or @username" icon="search" autoCapitalize="none" autoCorrect={false} />
      <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
        {list.map((p) => (
          <ListItem key={p.id} title={p.display_name} subtitle={`@${p.username}`} left={<Avatar uri={p.avatar_url} name={p.display_name} size={36} />}
            onPress={() => { onPick(p.id); setTerm(''); onClose(); }} />
        ))}
        {!list.length && <Text tone="muted" style={{ padding: space.lg }}>No one matches “{term}”.</Text>}
      </ScrollView>
    </Sheet>
  );
}

export default function Compare() {
  const params = useLocalSearchParams<{ a?: string; b?: string; groupId?: string }>();
  const { userId, profile } = useAuth();
  const friends = useFriends();
  const groups = useMyGroups();
  // where to pick players from: 'friends' or a group id
  const [source, setSource] = useState<string>(params.groupId ?? 'friends');
  const [a, setA] = useState<string | undefined>(params.a ?? userId ?? undefined);
  const [b, setB] = useState<string | undefined>(params.b);
  const groupId = source === 'friends' ? null : source;
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);

  const members = useQuery({
    queryKey: ['group', groupId, 'members-lite'],
    enabled: !!groupId,
    queryFn: () => q<any[]>(supabase.from('group_members').select('profile:profiles(id, username, display_name, avatar_url, position)').eq('group_id', groupId!)),
  });

  // the player(s) you opened Compare from are always pickable, even if not a friend
  const linked = useQuery({
    queryKey: ['profiles', 'compare', params.a, params.b],
    enabled: !!(params.a || params.b),
    queryFn: () => q<PublicProfile[]>(supabase.from('profiles').select('id, username, display_name, avatar_url, position').in('id', [params.a, params.b].filter(Boolean) as string[])),
  });
  const people = useMemo(() => {
    const me: PublicProfile | null = profile ? { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, position: profile.position } : null;
    const list = groupId
      ? (members.data ?? []).map((m) => m.profile).filter(Boolean) as PublicProfile[]
      : [...(me ? [me] : []), ...(friends.data?.friends ?? []), ...(linked.data ?? [])];
    const unique = new Map(list.map((p) => [p.id, p]));
    return [...unique.values()].sort((x, y) => (x.id === userId ? -1 : y.id === userId ? 1 : x.display_name.localeCompare(y.display_name)));
  }, [groupId, members.data, friends.data, linked.data, profile, userId]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  // swipe a side to the next / previous player (skipping whoever is on the other side)
  const cycle = (cur: string | undefined, dir: 1 | -1, other?: string) => {
    const list = people.filter((p) => p.id !== other);
    if (!list.length) return cur;
    const at = list.findIndex((p) => p.id === cur);
    return list[(at + dir + list.length) % list.length].id;
  };
  const pa = a ? byId.get(a) : undefined;
  const pb = b ? byId.get(b) : undefined;

  const h2h = useQuery({
    queryKey: ['h2h', a, b, groupId],
    enabled: !!pa && !!pb && a !== b,
    queryFn: () => rpc<any>('get_head_to_head', { p_a: a, p_b: b, p_group: groupId }),
  });
  const d = h2h.data;
  const ca = d?.a ?? {};
  const cb = d?.b ?? {};
  const n = (v: any) => Number(v ?? 0);
  const nameA = pa ? (pa.id === userId ? 'You' : pa.display_name) : 'Player A';
  const nameB = pb ? (pb.id === userId ? 'You' : pb.display_name) : 'Player B';
  const sourceName = groupId ? groups.data?.find((g) => g.id === groupId)?.name : null;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={680}>
      <Header title="Compare players" subtitle={sourceName ? `Within ${sourceName}` : 'Career stats'} right={<ScreenHelp id="compare" />} />

      <View style={{ gap: space.xs }}>
        <Spot id="compare.source"><SwipeSelect accessibilityLabel="Compare within" value={source} onChange={setSource}
          options={[{ value: 'friends', label: 'Friends · career', icon: 'people-outline' as const }, ...(groups.data ?? []).map((g) => ({ value: g.id as string, label: g.name, icon: 'shield-outline' as const }))]} /></Spot>
        {!!groupId && <Text variant="caption" tone="faint">Stats, form and rivalry only count this group’s games.</Text>}
      </View>

      {(groupId ? members.isLoading : friends.isLoading) ? <Loading /> : people.length < 2 ? (
        <EmptyState icon="people-outline" title="Not enough players" message={groupId ? 'This group needs at least two members.' : 'Add friends to compare players.'} />
      ) : (
        <Spot id="compare.vs"><Card>
          <Row style={{ alignItems: 'center' }}>
            <Slot person={pa} label="Player A" onOpen={() => setPicking('a')} onSwipe={(dir) => setA(cycle(a, dir, b))} />
            <Text variant="h2" tone="faint">VS</Text>
            <Slot person={pb} label="Player B" onOpen={() => setPicking('b')} onSwipe={(dir) => setB(cycle(b, dir, a))} />
          </Row>
        </Card></Spot>
      )}
      <PickSheet visible={!!picking} people={people} exclude={picking === 'a' ? b : a} onClose={() => setPicking(null)}
        onPick={(id) => (picking === 'a' ? setA(id) : setB(id))} />

      {(!pa || !pb) && people.length >= 2 && <Text tone="muted">Pick two players to compare.</Text>}
      {!!pa && !!pb && h2h.isLoading && <Loading />}
      {!!h2h.error && <ErrorState error={h2h.error} onRetry={h2h.refetch} />}
      {!!d && !!pa && !!pb && (
        <>
          <SectionTitle title={sourceName ? `${sourceName} record` : 'Career'} />
          <Card>
            <View style={{ gap: space.lg }}>
              <Bar label="Avg rating" a={n(ca.rating)} b={n(cb.rating)} format={(v) => rating(v)} />
              <Bar label="Recent form" a={n(d.a_form)} b={n(d.b_form)} format={(v) => rating(v)} />
              <Bar label="Appearances" a={n(ca.sessions)} b={n(cb.sessions)} />
              <Bar label="Wins" a={n(ca.wins)} b={n(cb.wins)} />
              <Bar label="Losses" a={n(ca.losses)} b={n(cb.losses)} lowerIsBetter />
              <Bar label="Win %" a={n(ca.win_pct)} b={n(cb.win_pct)} format={(v) => `${v.toFixed(0)}%`} />
              <Bar label="Goals" a={n(ca.goals)} b={n(cb.goals)} />
              <Bar label="Assists" a={n(ca.assists)} b={n(cb.assists)} />
              <Bar label="G/A" a={n(ca.goals) + n(ca.assists)} b={n(cb.goals) + n(cb.assists)} />
              <Bar label="MOTM" a={n(ca.motm)} b={n(cb.motm)} />
            </View>
          </Card>
          <SectionTitle title="Head to head · on opposite teams" />
          <Card>
            {d.rivalry.games === 0 ? <Text tone="muted">{nameA} and {nameB} haven’t faced each other yet{sourceName ? ` in ${sourceName}` : ''}.</Text> : (
              <View style={{ gap: space.md }}>
                <Row style={{ justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center', flex: 1 }}><Text variant="stat" tone="primary">{d.rivalry.a_wins}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{nameA} wins</Text></View>
                  <View style={{ alignItems: 'center', flex: 1 }}><Text variant="stat">{d.rivalry.draws}</Text><Text variant="caption" tone="muted">Draws</Text></View>
                  <View style={{ alignItems: 'center', flex: 1 }}><Text variant="stat">{d.rivalry.b_wins}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{nameB} wins</Text></View>
                </Row>
                <Text variant="small" tone="muted" align="center">Goals in those games: {d.rivalry.a_goals} – {d.rivalry.b_goals}</Text>
                {!!d.rivalry.last && <Text variant="small" tone="muted" align="center">Last met: {d.rivalry.last.name}, {formatDate(d.rivalry.last.played_at)} ({d.rivalry.last.a_score}–{d.rivalry.last.b_score})</Text>}
              </View>
            )}
          </Card>
          <Text variant="small" tone="muted">As teammates: {plural(d.teammates.games, 'game')} together, {d.teammates.wins} won.</Text>
        </>
      )}
    </Screen>
  );
}
