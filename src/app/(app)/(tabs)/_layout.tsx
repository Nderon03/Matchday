import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import { useAuth } from '@/providers/AuthProvider';
import { useNotifications } from '@/hooks/queries';
import { tourRef } from '@/features/tourTargets';

type Icon = keyof typeof Ionicons.glyphMap;
const TABS: { name: string; href: string; label: string; icon: Icon; active: Icon }[] = [
  { name: 'index', href: '/', label: 'Home', icon: 'home-outline', active: 'home' },
  { name: 'matches', href: '/matches', label: 'Matches', icon: 'football-outline', active: 'football' },
  { name: 'create', href: '/create', label: 'Create', icon: 'add', active: 'add' },
  { name: 'leagues', href: '/leagues', label: 'Leagues', icon: 'trophy-outline', active: 'trophy' },
  { name: 'profile', href: '/profile', label: 'Profile', icon: 'person-outline', active: 'person' },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function BottomBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        if (t.name === 'create') {
          return (
            <Pressable key={t.name} ref={tourRef('tab-create')} onPress={() => router.navigate('/create')} accessibilityRole="button" accessibilityLabel="Create" style={styles.tab}>
              <View style={[styles.create, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
                <Ionicons name="add" size={30} color={colors.onPrimary} />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={t.name} ref={tourRef(`tab-${t.name}`)} onPress={() => router.navigate(t.href as any)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label} style={styles.tab}>
            <Ionicons name={active ? t.active : t.icon} size={24} color={active ? colors.primary : colors.textMuted} />
            <Text variant="caption" tone={active ? 'primary' : 'muted'} style={{ fontSize: 11 }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Sidebar() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const { profile } = useAuth();
  const notifications = useNotifications();
  const unread = notifications.data?.filter((n) => !n.read_at).length ?? 0;
  const extra: { href: string; label: string; icon: Icon; badge?: number }[] = [
    { href: '/notifications', label: 'Notifications', icon: 'notifications-outline', badge: unread },
    { href: '/friends', label: 'Friends', icon: 'people-outline' },
    { href: '/settings', label: 'Settings', icon: 'settings-outline' },
  ];
  return (
    <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]} accessibilityRole="menu">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, marginBottom: space.xl }}>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="football" size={18} color={colors.onPrimary} />
        </View>
        <Text variant="h3">MATCHDAY</Text>
      </View>
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Pressable key={t.name} ref={tourRef(`tab-${t.name}`)} onPress={() => router.navigate(t.href as any)} accessibilityRole="menuitem" accessibilityState={{ selected: active }}
            style={({ hovered }: any) => [styles.navItem, { backgroundColor: t.name === 'create' ? colors.primary : active ? colors.primaryMuted : hovered ? colors.surfaceAlt : 'transparent' }]}>
            <Ionicons name={active ? t.active : t.icon} size={20} color={t.name === 'create' ? colors.onPrimary : active ? colors.primary : colors.textMuted} />
            <Text variant="bodyStrong" color={t.name === 'create' ? colors.onPrimary : active ? colors.primary : colors.text}>{t.name === 'create' ? 'Create session' : t.label}</Text>
          </Pressable>
        );
      })}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
      {extra.map((t) => (
        <Pressable key={t.href} ref={tourRef(t.href === '/notifications' ? 'bell' : t.href === '/friends' ? 'friends' : `side-${t.href}`)} onPress={() => router.push(t.href as any)} style={({ hovered }: any) => [styles.navItem, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}>
          <Ionicons name={t.icon} size={20} color={colors.textMuted} />
          <Text variant="body" style={{ flex: 1 }}>{t.label}</Text>
          {!!t.badge && <View style={{ backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 6 }}><Text variant="caption" color="#fff">{t.badge}</Text></View>}
        </Pressable>
      ))}
      <View style={{ flex: 1 }} />
      {!!profile && (
        <Pressable onPress={() => router.navigate('/profile')} style={[styles.navItem, { backgroundColor: colors.surfaceAlt }]}>
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={32} />
          <View style={{ flex: 1 }}>
            <Text variant="smallStrong" numberOfLines={1}>{profile.display_name}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>@{profile.username}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { isDesktop } = useLayout();
  const { colors } = useTheme();
  const tabs = (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }} tabBar={() => (isDesktop ? null : <BottomBar />)}>
      {TABS.map((t) => <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />)}
    </Tabs>
  );
  if (!isDesktop) return tabs;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <Sidebar />
      <View style={{ flex: 1 }}>{tabs}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  create: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: -22, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sidebar: { width: 248, borderRightWidth: StyleSheet.hairlineWidth, paddingVertical: space.xl, paddingHorizontal: space.md, gap: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 44, paddingHorizontal: space.md, borderRadius: radius.md },
});
