import { Platform } from 'react-native';
import * as Device from 'expo-device';

/**
 * Lite mode for older or low-memory Android phones (Android 8 or older, or under 3 GB of RAM,
 * e.g. a 2016 Galaxy A5): no looping animations or confetti, and the player card isn't
 * photographed in the background for link previews. Everything still works; it just does less
 * heavy drawing, which is what tends to crash old phones' graphics drivers and memory.
 */
const GB = 1024 ** 3;
export const LITE_MODE = Platform.OS === 'android' && (
  (typeof Platform.Version === 'number' && Platform.Version < 28) ||
  (typeof Device.totalMemory === 'number' && Device.totalMemory > 0 && Device.totalMemory < 3 * GB)
);
