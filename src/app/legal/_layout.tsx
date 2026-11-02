import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

/** Public pages (no sign-in needed): store listings and the web link to these URLs. */
export default function LegalLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
