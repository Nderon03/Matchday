/** Sounds must play every time, not just the first: a replay waits for the rewind before playing. */
const made: any[] = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => {
    let resolveSeek: () => void = () => undefined;
    const p: any = {
      currentTime: 0, volume: 1, plays: 0,
      play: jest.fn(() => { p.plays += 1; p.currentTime = 1; }),
      seekTo: jest.fn(() => new Promise<void>((r) => { resolveSeek = () => { p.currentTime = 0; r(); }; })),
      finishSeek: () => resolveSeek(),
    };
    made.push(p);
    return p;
  }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { sounds } from '../sounds';

it('plays a sound again after it has already played (waits for the rewind)', async () => {
  sounds.play('in');
  const p = made.find((x) => x.plays === 1);
  expect(p).toBeDefined();
  // second time: it rewinds first, and only plays once the rewind is done
  sounds.play('in');
  expect(p.seekTo).toHaveBeenCalledWith(0);
  expect(p.plays).toBe(1);
  p.finishSeek();
  await Promise.resolve(); await Promise.resolve();
  expect(p.plays).toBe(2);
});
