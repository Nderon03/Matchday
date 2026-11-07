import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import type { AppError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // kept a day so what you've loaded can be saved for when there's no signal (see lib/offline)
      gcTime: 24 * 3600_000,
      retry: (count, error) => {
        const code = (error as AppError)?.code;
        if (code === 'forbidden' || code === 'not_found' || code === 'not_authenticated') return false;
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: 0 },
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}
onlineManager.setOnline(true);
