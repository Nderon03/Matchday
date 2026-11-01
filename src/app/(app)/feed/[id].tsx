import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, ErrorState, Header, Input, Loading, Row, Screen, SectionTitle, Text, useToast } from '@/components/ui';
import { FeedItemCard } from '@/components/football/FeedItem';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { supabase } from '@/lib/supabase';
import { q, rpc } from '@/lib/api';
import { timeAgo } from '@/domain/format';
import { space } from '@/theme/tokens';
import type { FeedItem } from '@/hooks/queries';

export default function ActivityThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useRealtimeInvalidate(`comments-${id}`, [{ table: 'comments', filter: `activity_id=eq.${id}` }], [['thread', id]]);
  const thread = useQuery({
    queryKey: ['thread', id],
    queryFn: async () => {
      const [item, comments] = await Promise.all([
        q<FeedItem>(supabase.from('activity_feed').select('*, actor:profiles(id, username, display_name, avatar_url, position), group:groups(name), reactions(user_id, emoji), comments(count)').eq('id', id).single()),
        q<any[]>(supabase.from('comments').select('*, author:profiles(id, username, display_name, avatar_url)').eq('activity_id', id).order('created_at')),
      ]);
      return { item, comments };
    },
  });
  if (thread.isLoading) return <Screen><Header title="Activity" /><Loading /></Screen>;
  if (!thread.data) return <Screen><Header title="Activity" /><ErrorState error={thread.error} onRetry={thread.refetch} /></Screen>;
  const top = thread.data.comments.filter((c) => !c.parent_id);
  const replies = (pid: string) => thread.data!.comments.filter((c) => c.parent_id === pid);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('comments').insert({ activity_id: id, author_id: userId, body: body.trim(), parent_id: replyTo?.id ?? null });
    setBusy(false);
    if (error) return toast.error(error);
    setBody('');
    setReplyTo(null);
    thread.refetch();
  };

  const Comment = ({ c, indent }: { c: any; indent?: boolean }) => (
    <View style={{ marginLeft: indent ? space.xxl : 0, gap: 4 }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Avatar uri={c.author?.avatar_url} name={c.author?.display_name} size={28} />
        <View style={{ flex: 1 }}>
          <Text variant="smallStrong">{c.author?.display_name} <Text variant="caption" tone="faint">{timeAgo(c.created_at)}</Text></Text>
          <Text variant="small" tone={c.deleted_at ? 'faint' : 'default'}>{c.body}</Text>
          {!c.deleted_at && (
            <Row gap={space.md}>
              {!indent && <Text variant="caption" tone="primary" onPress={() => setReplyTo({ id: c.id, name: c.author?.display_name })}>Reply</Text>}
              {c.author_id === userId && <Text variant="caption" tone="danger" onPress={() => rpc('delete_comment', { p_comment: c.id }).then(() => thread.refetch()).catch(toast.error)}>Delete</Text>}
              {c.author_id !== userId && <Text variant="caption" tone="muted" onPress={() => rpc('report_content', { p_type: 'comment', p_target: c.id, p_reason: 'Inappropriate comment', p_group: thread.data!.item.group_id }).then(() => toast.success('Reported')).catch(toast.error)}>Report</Text>}
            </Row>
          )}
        </View>
      </Row>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}
      footer={
        <View style={{ gap: space.xs }}>
          {!!replyTo && <Text variant="caption" tone="muted">Replying to {replyTo.name} · <Text variant="caption" tone="primary" onPress={() => setReplyTo(null)}>cancel</Text></Text>}
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Input value={body} onChangeText={setBody} placeholder="Add a comment" maxLength={500} onSubmitEditing={send} returnKeyType="send" /></View>
            <Button title="Send" loading={busy} disabled={!body.trim()} onPress={send} />
          </Row>
        </View>
      }>
      <Header title="Activity" />
      <FeedItemCard item={thread.data.item} showComments={false} />
      <SectionTitle title={`Comments · ${thread.data.comments.length}`} />
      {top.length === 0 && <Text tone="muted" variant="small">Be the first to comment.</Text>}
      {top.map((c) => (
        <View key={c.id} style={{ gap: space.sm }}>
          <Comment c={c} />
          {replies(c.id).map((r) => <Comment key={r.id} c={r} indent />)}
        </View>
      ))}
    </Screen>
  );
}
