import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Button, Loading, Row, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { inviteUrl } from '@/lib/links';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Creates an invite link (friend / group / session) and shows it as a QR code with share actions. */
export function InviteQr({ kind, targetId, message }: { kind: 'friend' | 'group' | 'session'; targetId?: string; message: string }) {
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
  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      <View style={{ padding: space.md, backgroundColor: '#fff', borderRadius: radius.md }} accessible accessibilityLabel="Invite QR code">
        <QRCode value={url} size={168} color="#0A0C0F" backgroundColor="#fff" />
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1} selectable>{url}</Text>
      <Row gap={space.sm}>
        <Button title="Share" icon="share-outline" size="sm" onPress={() => shareText(message, url).catch(() => undefined)} />
        <Button title="Copy" icon="copy-outline" size="sm" variant="secondary" onPress={async () => { await Clipboard.setStringAsync(url); toast.success('Link copied'); }} />
      </Row>
      <Text variant="caption" tone="faint" style={{ color: colors.textFaint }}>Scan with a phone camera to open MATCHDAY.</Text>
    </View>
  );
}
