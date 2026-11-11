import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Button, Loading, Row, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { inviteUrl } from '@/lib/links';
import { shareText } from '@/lib/share';
import { whatsappUrl } from '@/domain/inviteMessage';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Creates an invite link (friend / group / session) and shows it as a QR code with share actions.
 * With `pitch`, it's the host starter kit: a ready-made group-chat message with one tap to WhatsApp.
 */
export function InviteQr({ kind, targetId, message, pitch, pitchLabel = 'Message for your group chat', pitchTip = 'Tip: pin it in the chat so new players can always find it.' }: {
  kind: 'friend' | 'group' | 'session';
  targetId?: string;
  message: string;
  pitch?: (url: string) => string;
  pitchLabel?: string;
  /** a hint under the buttons (null for none) */
  pitchTip?: string | null;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    rpc<string>('create_invite_link', { p_kind: kind, p_target: targetId ?? null })
      .then((code) => setUrl(inviteUrl(code)))
      .catch((e) => setError(e.message));
  }, [kind, targetId]);
  if (error) return <Text tone="danger" variant="small">{error}</Text>;
  if (!url) return <Loading />;
  const text = pitch?.(url);

  const qr = (
    <View style={{ alignItems: 'center', gap: space.sm }}>
      <View style={{ padding: space.md, backgroundColor: '#fff', borderRadius: radius.md }} accessible accessibilityLabel="Invite QR code">
        <QRCode value={url} size={text ? 140 : 168} color="#0A0C0F" backgroundColor="#fff" />
      </View>
      <Text variant="caption" tone="faint" style={{ color: colors.textFaint }}>Scan with a phone camera to open MATCHDAY.</Text>
    </View>
  );

  if (text) {
    return (
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.sm }}>
          <Row gap={6}>
            <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
            <Text variant="smallStrong">{pitchLabel}</Text>
          </Row>
          {/* reads like the chat bubble it'll become */}
          <View style={{ padding: space.md, borderRadius: radius.md, borderTopLeftRadius: 4, backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.border }}>
            <Text variant="small" selectable>{text}</Text>
          </View>
          <Button title="Send on WhatsApp" icon="logo-whatsapp" onPress={() => Linking.openURL(whatsappUrl(text)).catch(() => shareText(text).catch(() => undefined))} />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <Button title="Share" icon="share-outline" variant="secondary" size="sm" onPress={() => shareText(text).catch(() => undefined)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Copy message" icon="copy-outline" variant="secondary" size="sm" onPress={async () => { await Clipboard.setStringAsync(text); toast.success('Message copied'); }} />
            </View>
          </Row>
          {!!pitchTip && <Text variant="caption" tone="faint">{pitchTip}</Text>}
        </View>
        {qr}
        <Text variant="caption" tone="muted" numberOfLines={1} selectable align="center">{url}</Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      {qr}
      <Text variant="caption" tone="muted" numberOfLines={1} selectable>{url}</Text>
      <Row gap={space.sm}>
        <Button title="Share" icon="share-outline" size="sm" onPress={() => shareText(message, url).catch(() => undefined)} />
        <Button title="Copy" icon="copy-outline" size="sm" variant="secondary" onPress={async () => { await Clipboard.setStringAsync(url); toast.success('Link copied'); }} />
      </Row>
    </View>
  );
}
