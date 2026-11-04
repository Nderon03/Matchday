/** Light vibration feedback on key actions, with a user switch in Settings (on by default). */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const KEY = 'matchday.haptics';
let enabled = true;
const listeners = new Set<(v: boolean) => void>();
AsyncStorage.getItem(KEY).then((v) => { if (v === 'off') { enabled = false; listeners.forEach((l) => l(false)); } }).catch(() => undefined);

const ok = () => enabled && Platform.OS !== 'web';

export const haptics = {
  /** a button or selection tap */
  tap: () => { if (ok()) Haptics.selectionAsync().catch(() => undefined); },
  /** something good happened: paid, voted, achievement unlocked */
  success: () => { if (ok()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); },
  isEnabled: () => enabled,
  setEnabled: (v: boolean) => {
    enabled = v;
    listeners.forEach((l) => l(v));
    AsyncStorage.setItem(KEY, v ? 'on' : 'off').catch(() => undefined);
  },
  subscribe: (l: (v: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
