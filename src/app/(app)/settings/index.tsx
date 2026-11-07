import React, { useEffect, useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Divider, Header, Input, ListItem, Screen, SectionTitle, Segmented, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { keys, usePreferences } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { invoke } from '@/lib/api';
import { space } from '@/theme/tokens';
import type { ProfileVisibility } from '@/types/db';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { CONTACT_EMAIL } from '@/legal/content';
import { reportError, sentryEnabled } from '@/lib/sentry';
import { haptics } from '@/lib/haptics';
import { CalendarSyncSheet } from '@/features/CalendarSync';
import { ScreenHelp, Spot, TIPS_KEY, tourKey } from '@/features/ScreenHelp';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SCREEN_TOURS } from '@/features/screenTours';

/** Version line: app version plus which over-the-air update is running (handy when checking an update arrived). */
function versionLabel() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  if (Platform.OS === 'web') return `MATCHDAY v${version} · web`;
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) return `MATCHDAY v${version} · ${Platform.OS} · original build`;
  const when = Updates.createdAt ? ` · ${Updates.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${Updates.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';
  return `MATCHDAY v${version} · ${Platform.OS} · update ${Updates.updateId.slice(0, 8)}${when}`;
}

export default function Settings() {
  const { signOut, userId, session } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const prefs = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  // screen tips: on unless switched off; "show again" clears which tours you've seen
  const [tipsOn, setTipsOn] = useState(true);
  useEffect(() => { AsyncStorage.getItem(TIPS_KEY).then((v) => setTipsOn(v !== 'off')).catch(() => undefined); }, []);
  const setTips = (on: boolean) => { setTipsOn(on); AsyncStorage.setItem(TIPS_KEY, on ? 'on' : 'off').catch(() => undefined); };
  const resetTips = async () => {
    if (!userId) return;
    await AsyncStorage.multiRemove([...Object.keys(SCREEN_TOURS).map((id) => tourKey(id, userId)), 'matchday.groupTour']).catch(() => undefined);
    setTips(true);
    toast.success('Tips will show again on each screen');
  };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taps, setTaps] = useState(0);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [vibration, setVibration] = useState(haptics.isEnabled());
  const [calendarOpen, setCalendarOpen] = useState(false);
  useEffect(() => haptics.subscribe(setVibration), []);

  const setVisibility = async (v: ProfileVisibility) => {
    const { error } = await supabase.from('user_preferences').update({ profile_visibility: v, show_stats: v !== 'private' }).eq('user_id', userId!);
    if (error) return toast.error(error);
    qc.invalidateQueries({ queryKey: keys.prefs });
    toast.success('Privacy updated');
  };

  const icon = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={colors.textMuted} />;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="Settings" subtitle={session?.user.email} right={<ScreenHelp id="settings" />} />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <Spot id="settings.profile"><ListItem title="Edit profile" subtitle="Photo, name, username, position, bio" left={icon('person-circle-outline')} onPress={() => router.push('/settings/profile')} /></Spot>
        <Divider />
        <Spot id="settings.notifications"><ListItem title="Notifications" subtitle="Push, email and what you hear about" left={icon('notifications-outline')} onPress={() => router.push('/settings/notifications')} /></Spot>
        <Divider />
        <Spot id="settings.payouts"><ListItem title="Payouts" subtitle="Receive session fees with Stripe" left={icon('wallet-outline')} onPress={() => router.push('/settings/payouts')} /></Spot>
        <Divider />
        <Spot id="settings.history"><ListItem title="Payment history" left={icon('receipt-outline')} onPress={() => router.push('/payments')} /></Spot>
        <Divider />
        <Spot id="settings.calendar"><ListItem title="Sync with my calendar" subtitle="All your games in Google or Apple Calendar" left={icon('calendar-outline')} onPress={() => setCalendarOpen(true)} /></Spot>
        <Divider />
        <Spot id="settings.blocked"><ListItem title="Blocked players" left={icon('ban-outline')} onPress={() => router.push('/settings/blocked')} /></Spot>
      </Card>

      <SectionTitle title="Privacy" />
      <Spot id="settings.privacy"><Card>
        <View style={{ gap: space.sm }}>
          <Text variant="small" tone="muted">Who can see your statistics, achievements and bio? Group members always see your record within that group.</Text>
          {!!prefs.data && (
            <Segmented value={prefs.data.profile_visibility} onChange={setVisibility} options={[{ value: 'public', label: 'Everyone' }, { value: 'friends', label: 'Friends' }, { value: 'private', label: 'Only me' }]} />
          )}
        </View>
      </Card></Spot>

      <SectionTitle title="Appearance" />
      <Spot id="settings.theme"><Segmented value={preference} onChange={setPreference} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} /></Spot>
      {Platform.OS !== 'web' && (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <ListItem
            title="Vibration"
            subtitle="A light buzz on taps, votes and achievements"
            left={icon('phone-portrait-outline')}
            right={<Switch value={vibration} onValueChange={(v) => { haptics.setEnabled(v); if (v) haptics.tap(); }} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Vibration" />}
          />
        </Card>
      )}

      <SectionTitle title="About" />
      <Card padded={false}>
        <Spot id="settings.tour"><ListItem title="Replay the app tour" subtitle="A 30-second look around" left={icon('play-circle-outline')} onPress={() => router.navigate('/?tour=1')} /></Spot>
        <Divider />
        <Spot id="settings.tips" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
          {icon('sparkles-outline')}
          <View style={{ flex: 1 }}>
            <Text>Tips on new screens</Text>
            <Text variant="caption" tone="muted">A quick tour the first time you open each screen. The ? button always works.</Text>
          </View>
          <Switch value={tipsOn} onValueChange={setTips} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Tips on new screens" />
        </Spot>
        <Divider />
        <Spot id="settings.resettips"><ListItem title="Show all tips again" left={icon('refresh-outline')} onPress={resetTips} /></Spot>
        <Divider />
        <Spot id="settings.faq"><ListItem title="Help & FAQ" subtitle="Payments, waiting lists, medals, hosting" left={icon('help-circle-outline')} onPress={() => router.push('/help')} /></Spot>
        <Divider />
        <ListItem title="Terms of Use" left={icon('document-text-outline')} onPress={() => router.push('/legal/terms')} />
        <Divider />
        <ListItem title="Privacy Policy" left={icon('shield-checkmark-outline')} onPress={() => router.push('/legal/privacy')} />
        <Divider />
        <Spot id="settings.contact"><ListItem title="Contact us" subtitle={CONTACT_EMAIL} left={icon('mail-outline')} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} /></Spot>
      </Card>

      <SectionTitle title="Account" />
      <Spot id="settings.signout"><Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={signOut} /></Spot>
      <Spot id="settings.delete"><Button title="Delete account" variant="danger" icon="trash-outline" onPress={() => setDeleteOpen(true)} /></Spot>
      <Text variant="caption" tone="faint" align="center" onPress={() => {
        // hidden check: tap 5 times to send a test error to crash reporting
        const n = taps + 1;
        setTaps(n);
        if (n === 5) {
          setTaps(0);
          if (!sentryEnabled) return toast.show('Crash reporting is off in this build (no Sentry DSN).', 'error');
          reportError(new Error('MATCHDAY test error (sent from Settings)'));
          toast.success('Test error sent to Sentry');
        }
      }}>{versionLabel()}</Text>

      <CalendarSyncSheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} />
      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account">
        <Text tone="muted">This permanently deletes your profile, friends, statistics and notifications. Groups you own are handed to another admin. This cannot be undone.</Text>
        <Input label='Type DELETE to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
        <Button title="Delete permanently" variant="danger" disabled={confirm !== 'DELETE'} loading={busy} onPress={async () => {
          setBusy(true);
          try {
            await invoke('delete-account', { confirm: 'DELETE' });
            await supabase.auth.signOut();
            qc.clear();
            router.replace('/welcome');
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }} />
      </Sheet>
    </Screen>
  );
}
