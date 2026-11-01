import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dark, light, type ThemeColors } from './tokens';

type Preference = 'dark' | 'light' | 'system';
interface ThemeCtx {
  colors: ThemeColors;
  scheme: 'dark' | 'light';
  preference: Preference;
  setPreference: (p: Preference) => void;
  reduceMotion: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = 'matchday.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<Preference>('dark');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setPref(v as Preference)).catch(() => undefined);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const value = useMemo<ThemeCtx>(() => {
    const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
    return {
      colors: scheme === 'light' ? light : dark,
      scheme,
      preference,
      reduceMotion,
      setPreference: (p) => {
        setPref(p);
        AsyncStorage.setItem(KEY, p).catch(() => undefined);
      },
    };
  }, [preference, system, reduceMotion]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
