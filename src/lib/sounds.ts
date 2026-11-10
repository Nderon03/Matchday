/**
 * MATCHDAY's own short sounds (synthesised for us, in assets/sounds): the full-time whistle, a goal,
 * a medal unlock, "I'm in", a chime when a place opens up for you, and an optional soft tick on taps. Quiet, played with the matching haptic, never in silent mode, and
 * switchable in Settings → Sounds (on by default). Phones only.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const KEY = 'matchday.sounds';
// a soft tick on button taps: its own switch, off by default (Settings → Tap sounds)
const TAP_KEY = 'matchday.tapSounds';
let tapEnabled = false;
const tapListeners = new Set<(v: boolean) => void>();
AsyncStorage.getItem(TAP_KEY).then((v) => { if (v === 'on') { tapEnabled = true; tapListeners.forEach((l) => l(true)); } }).catch(() => undefined);
let lastTick = 0;
const FILES = {
  whistle: require('../../assets/sounds/whistle.wav'),
  goal: require('../../assets/sounds/goal.wav'),
  unlock: require('../../assets/sounds/unlock.wav'),
  in: require('../../assets/sounds/in.wav'),
  chime: require('../../assets/sounds/chime.wav'),
  tick: require('../../assets/sounds/tick.wav'),
} as const;
export type SoundName = keyof typeof FILES;

let enabled = true;
let ready = false;
const players: Partial<Record<SoundName, AudioPlayer>> = {};
const listeners = new Set<(v: boolean) => void>();
AsyncStorage.getItem(KEY).then((v) => { if (v === 'off') { enabled = false; listeners.forEach((l) => l(false)); } }).catch(() => undefined);

function setup() {
  if (ready) return;
  ready = true;
  // respect the phone's silent switch, and don't stop someone's music
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => undefined);
}

export const sounds = {
  play(name: SoundName) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      setup();
      const p = (players[name] ??= createAudioPlayer(FILES[name]));
      p.volume = name === 'tick' ? 0.35 : 0.6;
      p.seekTo(0).catch(() => undefined);
      p.play();
    } catch {
      // a sound is never worth a crash
    }
  },
  /** a soft tick on button taps (only with Tap sounds on; never faster than every 60 ms) */
  tick() {
    if (!tapEnabled || Date.now() - lastTick < 60) return;
    lastTick = Date.now();
    sounds.play('tick');
  },
  isTapEnabled: () => tapEnabled,
  setTapEnabled(v: boolean) {
    tapEnabled = v;
    AsyncStorage.setItem(TAP_KEY, v ? 'on' : 'off').catch(() => undefined);
    tapListeners.forEach((l) => l(v));
    if (v) sounds.tick();
  },
  subscribeTap(l: (v: boolean) => void) { tapListeners.add(l); return () => { tapListeners.delete(l); }; },
  isEnabled: () => enabled,
  setEnabled(v: boolean) {
    enabled = v;
    AsyncStorage.setItem(KEY, v ? 'on' : 'off').catch(() => undefined);
    listeners.forEach((l) => l(v));
    if (v) sounds.play('in');
  },
  subscribe(l: (v: boolean) => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};
