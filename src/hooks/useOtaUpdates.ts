import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Over-the-air updates (EAS Update). New JavaScript is downloaded in the background when the app
 * opens or comes back to the foreground, and applied the next time the user returns to the app,
 * so it never reloads in the middle of something.
 */
export function useOtaUpdates() {
  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return;
    let ready = false;
    let checking = false;
    const check = async () => {
      if (checking || ready) return;
      checking = true;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          ready = true;
        }
      } catch {
        // offline or no update server: try again next time
      } finally {
        checking = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (ready) Updates.reloadAsync().catch(() => undefined);
      else check();
    });
    return () => sub.remove();
  }, []);
}
