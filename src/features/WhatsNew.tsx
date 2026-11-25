import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname } from 'expo-router';
import Ionicons from '@/components/ui/Ionicons';
import { Button, Sheet, Text } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useHoldSpotlight, useSpotlightBusy } from '@/lib/spotlight';
import { isWhatsNewDue, RELEASES, whatsNewKey } from './whatsNewData';


/** The "What's new" card: opens on Home, after any other pop-up has finished. */
export function WhatsNew() {
  const { userId, profile } = useAuth();
  const { colors } = useTheme();
  const pathname = usePathname();
  const busy = useSpotlightBusy('whats-new');
  const release = RELEASES[0];
  const [due, setDue] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId || !release) return;
    let alive = true;
    const key = whatsNewKey(release.id, userId);
    Promise.all([AsyncStorage.getItem(key), AsyncStorage.getItem(`matchday.appTour.${userId}`)])
      .then(([seen, toured]) => {
        if (!alive) return;
        if (isWhatsNewDue(release, profile?.created_at, seen, toured)) setDue(true);
        // new players never see notes for things that were already there when they joined
        else if (!seen && toured) AsyncStorage.setItem(key, '1').catch(() => undefined);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [userId, release, profile?.created_at]);

  // let Home settle (and any match reveal claim the screen first)
  useEffect(() => {
    if (!due) return;
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, [due]);

  const showing = due && ready && !busy && pathname === '/';
  useHoldSpotlight('whats-new', showing);
  if (!release || !userId) return null;

  const close = (route?: string) => {
    setDue(false);
    AsyncStorage.setItem(whatsNewKey(release.id, userId), '1').catch(() => undefined);
    if (route) router.push(route as never);
  };

  return (
    <Sheet visible={showing} onClose={() => close()} title="What’s new">
      <View style={{ gap: space.xs }}>
        {release.items.map((it) => (
          <Pressable key={it.title} disabled={!it.route} onPress={() => close(it.route)} accessibilityRole={it.route ? 'button' : 'text'}
            accessibilityLabel={`${it.title}. ${it.body}${it.route ? ' Open' : ''}`}
            style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, padding: space.sm, borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
            <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={it.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{it.title}</Text>
              <Text variant="small" tone="muted">{it.body}</Text>
            </View>
            {!!it.route && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={{ alignSelf: 'center' }} />}
          </Pressable>
        ))}
      </View>
      <Button title="Got it" onPress={() => close()} />
    </Sheet>
  );
}
