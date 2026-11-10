import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as Device from 'expo-device';
import { Button, Card, Header, Input, Screen, Segmented, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { recentScreens, sendFeedbackToSentry } from '@/lib/sentry';
import { LITE_MODE } from '@/lib/device';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Kind = 'bug' | 'idea' | 'other';
const PROMPT: Record<Kind, { label: string; placeholder: string }> = {
  bug: { label: 'What went wrong?', placeholder: 'e.g. On the Scores screen, Save did nothing after I changed game 2' },
  idea: { label: 'What would make MATCHDAY better?', placeholder: 'e.g. Let players pick their own shirt number' },
  other: { label: 'Your message', placeholder: 'Anything you’d like us to know' },
};

/** Settings → Send feedback: a message plus the details that make it useful (no personal info). */
export default function FeedbackScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // where they were before opening this screen, and what they're using
  const screens = recentScreens.filter((s) => s !== '/settings/feedback');
  const context = {
    screen: screens[screens.length - 1] ?? null,
    recent_screens: screens.slice(-6),
    app_version: Constants.expoConfig?.version ?? null,
    update_id: Updates.updateId ?? null,
    platform: Platform.OS,
    os_version: String(Platform.Version ?? ''),
    device: Device.modelName ?? null,
    lite_mode: LITE_MODE,
  };

  const send = async () => {
    if (message.trim().length < 3) return toast.show('Tell us a little more first.', 'error');
    setBusy(true);
    try {
      await rpc('submit_feedback', { p_kind: kind, p_message: message.trim(), p_context: context });
      sendFeedbackToSentry(message.trim(), kind, context);
      setSent(true);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen edges={['top', 'bottom']} maxWidth={560} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={38} color={colors.primary} />
          </View>
          <Text variant="h2" align="center">Thanks, got it</Text>
          <Text tone="muted" align="center">{kind === 'bug' ? 'We’ll look into it. If we need more detail we’ll get in touch.' : 'Every message is read. Thanks for helping make MATCHDAY better.'}</Text>
          <Button title="Done" style={{ alignSelf: 'stretch', marginTop: space.md }} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} maxWidth={560}
      footer={<Button title="Send feedback" icon="send" size="lg" loading={busy} disabled={message.trim().length < 3} onPress={send} />}>
      <Header title="Send feedback" subtitle="Something broken, or an idea? Tell us." />
      <Segmented value={kind} onChange={setKind} options={[{ value: 'bug', label: 'Problem' }, { value: 'idea', label: 'Idea' }, { value: 'other', label: 'Other' }]} />
      <Input label={PROMPT[kind].label} value={message} onChangeText={setMessage} placeholder={PROMPT[kind].placeholder} multiline maxLength={2000} style={{ minHeight: 140, textAlignVertical: 'top' }} />
      <Card variant="alt">
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            We add your phone model, {Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'browser'} version, app version and the last few screens you visited, so we can find the problem. Nothing else.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
