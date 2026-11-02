import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, IconButton, Input, Row, SectionTitle, Sheet, Text, useConfirm } from '@/components/ui';
import type { SessionDetail } from '@/hooks/queries';
import { keys } from '@/hooks/queries';
import { useAction } from '@/hooks/useAction';
import { rpc } from '@/lib/api';
import { youtubeThumbnail, youtubeVideoId, youtubeWatchUrl } from '@/domain/youtube';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** "Watch the game": YouTube videos the host linked to this session. */
export function MatchVideos({ detail: d, now }: { detail: SessionDetail; now: number }) {
  const { colors } = useTheme();
  const confirm = useConfirm();
  const { run, busy } = useAction([keys.session(d.session.id)]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const s = d.session;
  const kickedOff = s.status !== 'scheduled' || new Date(s.starts_at).getTime() <= now;
  const canAdd = d.isManager && s.status !== 'cancelled' && kickedOff && d.videos.length < 5;
  if (!d.videos.length && !canAdd) return null;
  const parsed = url.trim() ? youtubeVideoId(url) : null;

  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle title={d.videos.length ? 'Watch the game' : 'Match video'} action={canAdd ? 'Add video' : undefined} onAction={() => { setUrl(''); setTitle(''); setOpen(true); }} />
      {d.videos.map((v) => (
        <Card key={v.id} padded={false}>
          <Pressable onPress={() => Linking.openURL(youtubeWatchUrl(v.video_id))} accessibilityRole="link" accessibilityLabel={`Watch ${v.title ?? 'match video'} on YouTube`}>
            <View>
              <Image source={{ uri: youtubeThumbnail(v.video_id) }} style={{ width: '100%', aspectRatio: 16 / 9, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surfaceAlt }} contentFit="cover" />
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
                <View style={{ width: 64, height: 44, borderRadius: 12, backgroundColor: '#FF0033', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play" size={26} color="#fff" />
                </View>
              </View>
            </View>
          </Pressable>
          <Row gap={space.sm} style={{ padding: space.md }}>
            <Ionicons name="logo-youtube" size={18} color={colors.textMuted} />
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{v.title ?? 'Match video'}</Text>
            {!!d.isManager && (
              <IconButton icon="trash-outline" label="Remove video" size={32} onPress={async () => {
                if (await confirm({ title: 'Remove this video?', message: 'It will no longer show on the session. The video stays on YouTube.', confirmLabel: 'Remove', destructive: true })) {
                  run(`rm-${v.id}`, () => rpc('remove_session_video', { p_video: v.id }), 'Video removed');
                }
              }} />
            )}
          </Row>
        </Card>
      ))}
      {!d.videos.length && <Text variant="small" tone="muted">Filmed the game? Add the YouTube link and the squad can watch it back here.</Text>}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Add a match video">
        <Text tone="muted">Paste a YouTube link. Upload the video to YouTube first (Unlisted keeps it private to people with the link).</Text>
        <Input label="YouTube link" value={url} onChangeText={setUrl} placeholder="https://youtu.be/…" autoCapitalize="none" autoCorrect={false} keyboardType="url"
          error={url.trim() && !parsed ? 'That doesn’t look like a YouTube video link' : null} />
        {!!parsed && (
          <Image source={{ uri: youtubeThumbnail(parsed) }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} contentFit="cover" />
        )}
        <Input label="Label (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Game 1, Highlights" maxLength={60} />
        <Text variant="caption" tone="faint">Only share videos the players are happy to appear in. The squad gets a notification.</Text>
        <Button title="Add video" icon="logo-youtube" disabled={!parsed} loading={busy === 'add'} onPress={async () => {
          const r = await run('add', () => rpc<string>('add_session_video', { p_session: s.id, p_url: url, p_title: title.trim() || null }), 'Video added — the squad has been notified');
          if (r) setOpen(false);
        }} />
      </Sheet>
    </View>
  );
}
