import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewInstance, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useLayout } from '@/hooks/useLayout';
import { Text } from './Text';
import { IconButton } from './Button';
import { ScreenScrollContext, type ScreenScroll } from './ScreenScroll';

/** Standard scrollable screen with responsive max-width and pull-to-refresh. */
export function Screen({
  children, scroll = true, refreshing, onRefresh, maxWidth = 920, padded = true, edges = ['top'], footer, contentStyle, ...rest
}: ScrollViewProps & {
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  maxWidth?: number;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}) {
  const { colors } = useTheme();
  const { isDesktop } = useLayout();
  const inner: ViewStyle = { width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: padded ? (isDesktop ? space.xxxl : space.lg) : 0 };
  // remember where we are so a tour can scroll to what it's pointing at
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const [scroller] = useState<ScreenScroll>(() => ({
    scrollBy: (dy: number) => scrollRef.current?.scrollTo({ y: Math.max(0, offset.current + dy), animated: true }),
  }));
  return (
    <SafeAreaView edges={isDesktop ? [] : edges} style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Keep the focused field and any bottom bar above the on-screen keyboard.
          iOS: scroll views inset themselves; a fixed footer is lifted with padding.
          Android: the screen shrinks to the space above the keyboard. */}
      <KeyboardAvoidingView
        style={styles.flex}
        enabled={Platform.OS === 'android' || (Platform.OS === 'ios' && (!scroll || !!footer))}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            scrollEventThrottle={32}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && !footer}
            contentContainerStyle={[{ paddingBottom: space.huge, paddingTop: isDesktop ? space.xxl : space.sm }, contentStyle]}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
            {...rest}
            onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; rest.onScroll?.(e); }}
          >
            <ScreenScrollContext.Provider value={scroller}>
              <View style={[inner, { gap: space.lg }]}>{children}</View>
            </ScreenScrollContext.Provider>
          </ScrollView>
        ) : (
          <View style={[styles.flex, inner, contentStyle]}>{children}</View>
        )}
        {!!footer && <View style={[inner, { paddingBottom: space.lg, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** In-screen header with back navigation that always has a route home. */
export function Header({ title, subtitle, right, back = true }: { title: string; subtitle?: string; right?: React.ReactNode; back?: boolean }) {
  return (
    <View style={styles.header}>
      {!!back && (
        <IconButton
          icon="chevron-back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text variant="h2" numberOfLines={2} accessibilityRole="header">{title}</Text>
        {!!subtitle && <Text variant="small" tone="muted" numberOfLines={2}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted" accessibilityRole="header">{title}</Text>
      {!!action && (
        <Text variant="smallStrong" tone="primary" onPress={onAction} accessibilityRole="button" suppressHighlighting>
          {action}
        </Text>
      )}
    </View>
  );
}

export function Row({ children, gap = space.sm, style, wrap }: { children: React.ReactNode; gap?: number; style?: ViewStyle; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function ListItem({ title, subtitle, left, right, onPress, chevron = !!onPress, danger }: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.item}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text variant="small" tone="muted" numberOfLines={2}>{subtitle}</Text>}
      </View>
      {right}
      {!!chevron && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

export function useBottomInset() {
  return useSafeAreaInsets().bottom;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 56 },
});
