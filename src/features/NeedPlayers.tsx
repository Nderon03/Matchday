import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Row, Sheet, Text, useToast } from '@/components/ui';
import { formatKickoff, plural } from '@/domain/format';
import { rpc } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface Preview { places_left: number; friends: number; nearby: number; last_call_at: string | null; next_call_at: string | null }

/**
 * "Need players": for hosts of a game that isn't full. One call invites friends of the squad
 * first, then players who've recently played nearby (up to 40), with an optional message.
 */
export function NeedPlayers({ sessionId, placesLeft }: { sessionId: string; placesLeft: number }) {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: ['session', sessionId, 'players-call'],
    enabled: open,
    queryFn: () => rpc<Preview>('preview_players_call', { p_session: sessionId }),
  });
  const p = preview.data;
  const reach = p ? p.friends + p.nearby : 0;
  // the server only sends next_call_at while the 3-hour gap is still running
  const waiting = !!p?.next_call_at;

  const send = async () => {
    setBusy(true);
    try {
      const n = await rpc<number>('call_for_players', { p_session: sessionId, p_message: message.trim() || null });
      haptics.success();
      toast.success(n ? `Sent to ${plural(n, 'player')}. We’ll tell you as they join.` : 'No one new to ask right now. Try sharing the invite link.');
      setOpen(false);
      setMessage('');
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title={`Need players? ${placesLeft} ${placesLeft === 1 ? 'place' : 'places'} left`} icon="megaphone-outline" variant="secondary" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Find players">
        <View style={{ gap: space.md }}>
          <Text tone="muted">One message to people likely to say yes. They get an invite and can join straight away.</Text>
          {!p ? <Text variant="caption" tone="faint">Working out who to ask…</Text> : (
            <View style={{ gap: space.sm }}>
              {[
                { icon: 'people-outline' as const, n: p.friends, label: 'friends of your squad' },
                { icon: 'navigate-outline' as const, n: p.nearby, label: 'players who’ve played near this venue' },
              ].map((x) => (
                <Row key={x.label} gap={space.md} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
                  <Ionicons name={x.icon} size={20} color={colors.primary} />
                  <Text style={{ flex: 1 }}><Text variant="bodyStrong">{x.n}</Text> {x.label}</Text>
                </Row>
              ))}
            </View>
          )}
          <Input label="Add a message (optional)" value={message} onChangeText={setMessage} maxLength={140} placeholder="e.g. Friendly game, all levels welcome" />
          {waiting ? (
            <Text variant="small" tone="muted" align="center">You sent a call recently. You can send another after {formatKickoff(p!.next_call_at!)}.</Text>
          ) : (
            <Button title={reach ? `Send to ${plural(reach, 'player')}` : 'No one new to ask'} size="lg" icon="send" loading={busy} disabled={!reach} onPress={send} />
          )}
          <Text variant="caption" tone="faint" align="center">People can turn these off in their notification settings.</Text>
        </View>
      </Sheet>
    </>
  );
}
