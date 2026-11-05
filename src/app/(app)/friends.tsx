import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, Card, EmptyState, ErrorState, Header, Input, Row, Screen, SectionTitle, Segmented, Sheet, SkeletonList, Text } from '@/components/ui';
import { InviteQr } from '@/components/football/InviteQr';
import { keys, useFriends } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { timeAgo } from '@/domain/format';
import { space } from '@/theme/tokens';
import { HandshakeModal, type Friend } from '@/features/moments/Handshake';

interface SearchRow { id: string; username: string; display_name: string; avatar_url: string | null; is_friend: boolean; request_pending: boolean }

export default function Friends() {
  const [newFriend, setNewFriend] = useState<Friend | null>(null);
  const friends = useFriends();
  const { run, busy } = useAction([keys.friends]);
  const [tab, setTab] = useState<'friends' | 'requests' | 'find'>('friends');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchRow[] | null>(null);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const searchable = query.trim().length >= 2;
  useEffect(() => {
    if (!searchable) return;
    const t = setTimeout(() => {
      rpc<SearchRow[]>('search_users', { p_query: query.trim() }).then((r) => { setResults(r); setSearchError(null); }).catch(setSearchError);
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchable]);
  const shown = searchable ? results : null;

  const d = friends.data;
  const requestCount = d?.incoming.length ?? 0;

  return (
    <Screen edges={['top', 'bottom']} onRefresh={friends.refetch} refreshing={friends.isRefetching}>
      <Header title="Friends" right={<Row gap={space.xs}><Button title="Scan" icon="scan-outline" size="sm" variant="ghost" onPress={() => router.push('/scan')} /><Button title="My QR" icon="qr-code-outline" size="sm" variant="secondary" onPress={() => setQrOpen(true)} /></Row>} />
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'friends', label: `Friends${d ? ` · ${d.friends.length}` : ''}` },
        { value: 'requests', label: `Requests${requestCount ? ` · ${requestCount}` : ''}` },
        { value: 'find', label: 'Find' },
      ]} />
      {!!friends.isLoading && <SkeletonList />}
      {!!friends.error && <ErrorState error={friends.error} onRetry={friends.refetch} />}

      {tab === 'friends' && d && (
        d.friends.length === 0 ? (
          <EmptyState icon="people-outline" title="No friends yet" message="Find your teammates by username or share your QR code." action={{ label: 'Find players', onPress: () => setTab('find') }} />
        ) : (
          <Card padded={false}>
            {d.friends.map((f) => (
              <Row key={f.id} gap={space.md} style={{ padding: space.md }}>
                <Avatar uri={f.avatar_url} name={f.display_name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" onPress={() => router.push(`/player/${f.id}`)}>{f.display_name}</Text>
                  <Text variant="caption" tone="muted">@{f.username}</Text>
                </View>
                <Button title="Compare" size="sm" variant="ghost" onPress={() => router.push({ pathname: '/compare', params: { b: f.id } })} />
              </Row>
            ))}
          </Card>
        )
      )}

      {tab === 'requests' && d && (
        <View style={{ gap: space.md }}>
          {d.incoming.length === 0 && d.outgoing.length === 0 && <EmptyState icon="mail-open-outline" title="No pending requests" />}
          {d.incoming.length > 0 && <SectionTitle title="Received" />}
          {d.incoming.map((r) => (
            <Card key={r.id}>
              <Row gap={space.md}>
                <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{r.profile.display_name}</Text>
                  <Text variant="caption" tone="muted">@{r.profile.username} · {timeAgo(r.created_at)}</Text>
                </View>
                <Button title="Accept" size="sm" loading={busy === `a-${r.id}`} onPress={async () => {
                  const ok = await run(`a-${r.id}`, () => rpc('respond_friend_request', { p_request: r.id, p_accept: true }));
                  if (ok !== undefined) setNewFriend(r.profile);
                }} />
                <Button title="Reject" size="sm" variant="ghost" onPress={() => run(`r-${r.id}`, () => rpc('respond_friend_request', { p_request: r.id, p_accept: false }))} />
              </Row>
            </Card>
          ))}
          {d.outgoing.length > 0 && <SectionTitle title="Sent" />}
          {d.outgoing.map((r) => (
            <Row key={r.id} gap={space.md}>
              <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={32} />
              <Text style={{ flex: 1 }}>{r.profile.display_name}</Text>
              <Button title="Cancel" size="sm" variant="ghost" onPress={() => run(`c-${r.id}`, () => rpc('cancel_friend_request', { p_request: r.id }))} />
            </Row>
          ))}
        </View>
      )}

      {tab === 'find' && (
        <View style={{ gap: space.md }}>
          <Input placeholder="Search by username or name" value={query} onChangeText={setQuery} autoCapitalize="none" icon="search" autoFocus />
          {searchError ? <ErrorState error={searchError} compact /> : null}
          {shown?.length === 0 && <Text tone="muted">No players found for “{query}”.</Text>}
          {shown?.map((u) => (
            <Card key={u.id}>
              <Row gap={space.md}>
                <Avatar uri={u.avatar_url} name={u.display_name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" onPress={() => router.push(`/player/${u.id}`)}>{u.display_name}</Text>
                  <Text variant="caption" tone="muted">@{u.username}</Text>
                </View>
                {u.is_friend ? <Text variant="small" tone="primary">Friends</Text> : u.request_pending ? <Text variant="small" tone="muted">Pending</Text> : (
                  <Button title="Add" size="sm" icon="person-add-outline" loading={busy === `s-${u.id}`} onPress={async () => {
                    const r = await run(`s-${u.id}`, () => rpc<string>('send_friend_request', { p_target: u.id }), (x) => (x === 'accepted' ? '' : 'Request sent'));
                    // they'd already asked you: it's a friendship straight away
                    if (r === 'accepted') setNewFriend(u);
                    if (r) setResults((rs) => rs?.map((x) => (x.id === u.id ? { ...x, request_pending: r !== 'accepted', is_friend: r === 'accepted' } : x)) ?? null);
                  }} />
                )}
              </Row>
            </Card>
          ))}
        </View>
      )}

      <Sheet visible={qrOpen} onClose={() => setQrOpen(false)} title="Add me on MATCHDAY">
        <InviteQr kind="friend" message="Add me on MATCHDAY" />
      </Sheet>
      <HandshakeModal them={newFriend} onClose={() => setNewFriend(null)} />
    </Screen>
  );
}
