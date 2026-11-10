/**
 * "Rate MATCHDAY": Google's own in-app rating card, shown after a happy moment (winning the
 * award, a medal or card-style unlock, a match reveal with a win). Only from the second happy
 * moment on, at most once every 4 months, and never on the web. Google also limits how often the
 * card can appear, so asking is always safe.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const MOMENTS = 'matchday.review.moments';
const ASKED = 'matchday.review.askedAt';
const GAP = 120 * 86400_000;

export async function happyMoment() {
  if (Platform.OS === 'web') return;
  try {
    const n = Number((await AsyncStorage.getItem(MOMENTS)) ?? '0') + 1;
    await AsyncStorage.setItem(MOMENTS, String(n));
    const last = Number((await AsyncStorage.getItem(ASKED)) ?? '0');
    if (n < 2 || Date.now() - last < GAP) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await AsyncStorage.setItem(ASKED, String(Date.now()));
    // let the celebration finish first
    setTimeout(() => { StoreReview.requestReview().catch(() => undefined); }, 1200);
  } catch {
    // never in the way
  }
}
