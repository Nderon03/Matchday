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
  /** full-time whistle: two short sharp taps (a game completed, results in) */
  whistle: () => {
    if (!ok()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined), 140);
  },
  /** goal: one heavy thump (a goal or result approved) */
  goal: () => { if (ok()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined); },
  /** an unlock (medal, card style, title): a rising light → medium → heavy run, then success */
  unlock: () => {
    if (!ok()) return;
    const steps = [Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy];
    steps.forEach((st, i) => setTimeout(() => Haptics.impactAsync(st).catch(() => undefined), i * 90));
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined), 330);
  },
  /** you're in: a soft double pulse, like a heartbeat */
  in: () => {
    if (!ok()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined), 110);
  },
  isEnabled: () => enabled,
  setEnabled: (v: boolean) => {
    enabled = v;
    listeners.forEach((l) => l(v));
    AsyncStorage.setItem(KEY, v ? 'on' : 'off').catch(() => undefined);
  },
  subscribe: (l: (v: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
