import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Sheet, Text, useConfirm, useToast } from '@/components/ui';
import { env } from '@/lib/env';
import { rpc } from '@/lib/api';
import { space } from '@/theme/tokens';
import { calendarLinks } from '@/domain/calendarLinks';

/**
 * "Subscribe in my calendar": all my games (playing, waiting, invited, hosting) in Google or Apple
 * Calendar, kept up to date. Changes and cancellations follow automatically.
 */
export function CalendarSyncSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ['calendar-feed'], enabled: visible, queryFn: () => rpc<string>('get_calendar_feed'), staleTime: Infinity });
  const [busy, setBusy] = useState(false);
  const links = feed.data ? calendarLinks(feed.data, env.supabaseUrl) : null;
  const open = (url: string) => Linking.openURL(url).catch(() => toast.error('Couldn’t open your calendar app.'));
  return (
    <Sheet visible={visible} onClose={onClose} title="Sync with my calendar">
      <Text tone="muted">
        Adds every game you’re playing in, waiting for, invited to or hosting. New games appear, time changes move and cancelled games disappear on their own.
      </Text>
      <View style={{ gap: space.sm }}>
        <Button title="Google Calendar" icon="logo-google" disabled={!links} onPress={() => links && open(links.google)} />
        <Button title="Apple Calendar / Outlook" icon="calendar-outline" variant="secondary" disabled={!links} onPress={() => links && open(links.webcal)} />
        <Button title="Copy link" icon="copy-outline" variant="ghost" disabled={!links}
          onPress={async () => { if (!links) return; await Clipboard.setStringAsync(links.https); toast.success('Link copied. Add it as a calendar “From URL”.'); }} />
      </View>
      <Text variant="caption" tone="faint">
        Calendars check for updates every few hours, so changes can take a little while to show. Keep this link to yourself: anyone with it can see your games.
      </Text>
      <Button title="Reset link" variant="ghost" size="sm" loading={busy} onPress={async () => {
        if (!(await confirm({ title: 'Reset your calendar link?', message: 'The old link stops working, so calendars using it stop updating. Subscribe again with the new one.', confirmLabel: 'Reset', destructive: true }))) return;
        setBusy(true);
        try {
          const token = await rpc<string>('get_calendar_feed', { p_reset: true });
          qc.setQueryData(['calendar-feed'], token);
          toast.success('New link ready');
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }} />
    </Sheet>
  );
}
