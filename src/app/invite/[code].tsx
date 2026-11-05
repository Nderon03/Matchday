import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, ErrorState, Loading, Row, Screen, Text, useToast } from '@/components/ui';
import { PlayerCard } from '@/components/football/PlayerCard';
import { Confetti } from '@/components/football/Confetti';
import { HandshakeScene } from '@/features/moments/Handshake';
import { rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { formatKickoff } from '@/domain/format';
import { usePriceLabel } from '@/hooks/useFees';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const first = (name?: string | null) => (name ?? '').split(' ')[0] || 'them';

/** Deep-link landing for friend / group / game invites (also the QR target). */
export default function InviteLanding() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, initialising } = useAuth();
  const invite = useQuery({ queryKey: ['invite', code], enabled: !!session, queryFn: () => rpc<any>('get_invite', { p_code: code }) });
  // signed out: a short public summary so they know what they're signing up for
  const teaser = useQuery({ queryKey: ['invite-teaser', code], enabled: !initialising && !session, queryFn: () => rpc<any>('get_link_preview', { p_code: code }).catch(() => null) });

  useEffect(() => {
    if (!initialising && !session) AsyncStorage.setItem('matchday.pendingInvite', code).catch(() => undefined);
  }, [initialising, session, code]);

  if (initialising) return <Screen><Loading /></Screen>;
  if (!session) return <SignedOut teaser={teaser.data} />;
  if (invite.isLoading) return <Screen><Loading /></Screen>;
  if (!invite.data) return <Screen><ErrorState error={invite.error} onRetry={invite.refetch} /></Screen>;
  const d = invite.data;
  if (!d.valid) {
    return (
      <Screen edges={['top', 'bottom']} maxWidth={480}>
        <View style={{ gap: space.md, paddingTop: space.huge, alignItems: 'center' }}>
          <Ionicons name="hourglass-outline" size={44} color="#8A94A3" />
          <Text variant="h2" align="center">This invite has run out</Text>
          <Text tone="muted" align="center">{d.reason === 'expired' ? 'Invite links last 7 days.' : 'This invite link is no longer valid.'} Ask for a new one.</Text>
          <Button title="Go home" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }
  if (d.kind === 'friend') return <FriendInvite code={code} p={d.preview} />;
  if (d.kind === 'group') return <GroupInvite code={code} p={d.preview} targetId={d.target_id} />;
  return <GameInvite code={code} p={d.preview} targetId={d.target_id} />;
}

async function acceptInvite(code: string) {
  const r = await rpc<any>('accept_invite', { p_code: code });
  await AsyncStorage.removeItem('matchday.pendingInvite').catch(() => undefined);
  return r;
}

function SignedOut({ teaser }: { teaser: any }) {
  const line = !teaser ? 'Sign in or create an account to accept.'
    : teaser.kind === 'friend' ? `${teaser.name} wants to add you as a friend on MATCHDAY.`
    : teaser.kind === 'group' ? `You’re invited to join ${teaser.name}${teaser.members ? `, ${teaser.members} players` : ''}.`
    : `You’re invited to ${teaser.name}${teaser.starts_at ? `, ${formatKickoff(teaser.starts_at)}` : ''}.`;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <View style={{ gap: space.lg, paddingTop: space.huge }}>
        <Text variant="overline" tone="primary">MATCHDAY</Text>
        <Text variant="h1">You’ve been invited</Text>
        <Text tone="muted">{line} It takes a minute, and we’ll bring you straight back here.</Text>
        <Button title="Create account" size="lg" onPress={() => router.push('/sign-up')} />
        <Button title="I already have an account" variant="secondary" size="lg" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Friend invite: their player card, mutual friends, then a handshake.
// ---------------------------------------------------------------------------
function FriendInvite({ code, p }: { code: string; p: any }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const name = first(p.display_name);
  if (done) return <FriendsNow them={p} />;
  const accept = async () => {
    setBusy(true);
    try {
      await acceptInvite(code);
      setDone(true);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen edges={['top', 'bottom']} maxWidth={520}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="overline" tone="primary">Friend invite</Text>
          <Text variant="h1">{p.is_self ? 'This is your own invite' : `${name} wants to play with you`}</Text>
        </View>
        <PlayerCard data={{
          display_name: p.display_name, username: p.username, avatar_url: p.avatar_url, position: p.position,
          stats: p.stats ? { ...p.stats, rating: p.stats.rating === null ? null : Number(p.stats.rating) } : null,
          achievements: p.medal_points, card_style: p.card_style, nationality: p.nationality, supported_club: p.supported_club,
        }} />
        {!p.stats && !p.is_self && <Text variant="caption" tone="faint" align="center">{name}’s stats are private until you’re friends.</Text>}

        {p.mutual_count > 0 && (
          <Row gap={space.sm}>
            <View style={{ flexDirection: 'row' }}>
              {p.mutual.slice(0, 3).map((m: any, i: number) => (
                <View key={m.display_name + i} style={{ marginLeft: i ? -8 : 0, borderRadius: 999, borderWidth: 2, borderColor: colors.bg }}>
                  <Avatar uri={m.avatar_url} name={m.display_name} size={26} />
                </View>
              ))}
            </View>
            <Text variant="small" tone="muted" style={{ flex: 1 }}>
              {p.mutual_count} mutual friend{p.mutual_count === 1 ? '' : 's'}: {p.mutual.slice(0, 2).map((m: any) => first(m.display_name)).join(', ')}{p.mutual_count > 2 ? ` and ${p.mutual_count - 2} more` : ''}
            </Text>
          </Row>
        )}

        {!p.is_self && !p.already_friends && (
          <Card variant="alt">
            <View style={{ gap: space.sm }}>
              {[
                ['mail-outline', 'Invite each other to games in a tap'],
                ['git-compare-outline', 'Compare stats head to head'],
                ['people-outline', 'See who you win most with'],
              ].map(([icon, text]) => (
                <Row key={text} gap={space.sm}><Ionicons name={icon as any} size={18} color={colors.primary} /><Text variant="small">{text}</Text></Row>
              ))}
            </View>
          </Card>
        )}

        {p.is_self ? (
          <Button title="Go home" size="lg" onPress={() => router.replace('/')} />
        ) : p.already_friends ? (
          <>
            <Text tone="muted" align="center">You and {name} are already friends.</Text>
            <Button title={`See ${name}’s profile`} size="lg" onPress={() => router.replace(`/player/${p.id}`)} />
          </>
        ) : (
          <>
            <Button title={`Add ${name} as a friend`} icon="hand-left-outline" size="lg" loading={busy} onPress={accept} />
            <Button title="Not now" variant="ghost" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}

/** The celebration after accepting a friend link. */
function FriendsNow({ them }: { them: any }) {
  const { reduceMotion } = useTheme();
  return (
    <Screen edges={['top', 'bottom']} maxWidth={480} scroll={false}>
      {!reduceMotion && <Confetti colour="#22C55E" />}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <HandshakeScene them={{ id: them.id, display_name: them.display_name, avatar_url: them.avatar_url }} />
        <Button title="Done" variant="ghost" onPress={() => router.replace('/')} style={{ marginTop: space.sm }} />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Group and game invites
// ---------------------------------------------------------------------------
function GroupInvite({ code, p, targetId }: { code: string; p: any; targetId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      const r = await acceptInvite(code);
      haptics.success();
      router.replace(`/group/${r.target_id}`); // the group's welcome moment plays there
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen edges={['top', 'bottom']} maxWidth={520}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="overline" tone="primary">Group invite</Text>
          <Text variant="h1">{p.invited_by ? `${first(p.invited_by)} wants you in ${p.name}` : `Join ${p.name}`}</Text>
        </View>
        <Card variant="highlight">
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Avatar uri={p.logo_url} name={p.name} size={80} ring={colors.primary} />
            <Text variant="h2" align="center">{p.name}</Text>
            <Text tone="muted" align="center">{p.members} player{p.members === 1 ? '' : 's'}{p.location ? ` · ${p.location}` : ''}</Text>
            {!!p.faces?.length && (
              <View style={{ flexDirection: 'row', marginTop: space.xs }}>
                {p.faces.map((f: any, i: number) => (
                  <View key={f.display_name + i} style={{ marginLeft: i ? -10 : 0, borderRadius: 999, borderWidth: 2, borderColor: colors.surface }}>
                    <Avatar uri={f.avatar_url} name={f.display_name} size={32} />
                  </View>
                ))}
              </View>
            )}
            {!!p.description && <Text variant="small" tone="muted" align="center">{p.description}</Text>}
          </View>
        </Card>
        {p.already_member ? (
          <Button title="Open the group" size="lg" onPress={() => router.replace(`/group/${targetId}`)} />
        ) : (
          <>
            <Button title="Join the group" icon="people" size="lg" loading={busy} onPress={join} />
            <Button title="Not now" variant="ghost" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}

function GameInvite({ code, p, targetId }: { code: string; p: any; targetId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const price = usePriceLabel();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await acceptInvite(code);
      router.replace(`/session/${targetId}`); // they tap "I'm in" there
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const cancelled = p.status === 'cancelled';
  const rows: [keyof typeof Ionicons.glyphMap, string][] = [
    ['time-outline', formatKickoff(p.starts_at)],
    ...(p.venue || p.area ? [['location-outline', [p.venue, p.area].filter(Boolean).join(' · ')] as [keyof typeof Ionicons.glyphMap, string]] : []),
    ['people-outline', p.places_left === 0 ? 'Full: you can join the waiting list' : `${p.places_left} of ${p.max} places left`],
    ['card-outline', p.payment_mode === 'free' ? 'Free' : `${price(p.price_pence).total} per player`],
  ];
  return (
    <Screen edges={['top', 'bottom']} maxWidth={520}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="overline" tone="primary">Game invite</Text>
          <Text variant="h1">{cancelled ? 'This game was cancelled' : p.host ? `${first(p.host)} wants you to play` : 'You’re invited to play'}</Text>
        </View>
        <Card variant={cancelled ? 'default' : 'highlight'}>
          <View style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="overline" tone="primary">{p.format_size}-a-side</Text>
              {p.places_left > 0 && p.places_left <= 2 && !cancelled && <Text variant="caption" style={{ color: colors.warning, fontWeight: '700' }}>Nearly full</Text>}
            </Row>
            <Text variant="h2">{p.name}</Text>
            {rows.map(([icon, text]) => (
              <Row key={text} gap={8}><Ionicons name={icon} size={17} color={colors.textMuted} /><Text style={{ flex: 1 }}>{text}</Text></Row>
            ))}
            {!!p.host && (
              <Row gap={8} style={{ paddingTop: space.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Avatar uri={p.host_avatar} name={p.host} size={22} />
                <Text tone="muted">Hosted by {p.host}</Text>
              </Row>
            )}
          </View>
        </Card>
        {cancelled ? (
          <Button title="Go home" size="lg" onPress={() => router.replace('/')} />
        ) : (
          <>
            <Button title="See the game" icon="football" size="lg" loading={busy} onPress={open} />
            <Text variant="caption" tone="faint" align="center">You’ll choose “I’m in” on the next screen.</Text>
            <Button title="Not now" variant="ghost" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}

