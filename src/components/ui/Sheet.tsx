import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';
import { IconButton } from './Button';

/**
 * Bottom sheet on phones, centred dialog on wide screens. Its content scrolls when it's taller
 * than the screen, so a Save button at the bottom is always reachable. Sheets that hold their
 * own list pass scroll={false} (the list then shrinks to fit and scrolls itself).
 */
export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.positioner} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal>
            <View style={styles.head}>
              <Text variant="h3" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
              <IconButton icon="close" label="Close" size={34} onPress={onClose} />
            </View>
            {scroll ? (
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: space.md, paddingBottom: space.xs }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {children}
              </ScrollView>
            ) : (
              <View style={{ flexShrink: 1, minHeight: 0, gap: space.md }}>{children}</View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  positioner: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, padding: space.lg, gap: space.md, maxHeight: '90%' },
  head: { flexDirection: 'row', alignItems: 'center' },
});
