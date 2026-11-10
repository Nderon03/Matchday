import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { env } from './env';
import { LITE_MODE } from './device';

/**
 * Crash and error reporting (Sentry). Only active in installed builds with a DSN configured
 * (EXPO_PUBLIC_SENTRY_DSN), never in development or on the web. No personal details are sent:
 * just the error, device/app version and the user's internal id.
 */
export const sentryEnabled = !!env.sentryDsn && !__DEV__ && Platform.OS !== 'web';

if (sentryEnabled) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',
    release: `matchday@${Constants.expoConfig?.version ?? '1.0.0'}`,
    dist: Updates.updateId ?? undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    enableAutoSessionTracking: true,
  });
  Sentry.setTag('lite_mode', LITE_MODE ? 'on' : 'off');
}

/** Which screen someone was on, so a crash report shows the last few screens before it. */
export function trackScreen(path: string) {
  if (!sentryEnabled) return;
  // ids out, so screens group together: /session/abc-123/goals → /session/:id/goals
  const screen = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/[A-Za-z0-9]{10,}(?=\/|$)/g, '/:code');
  Sentry.addBreadcrumb({ category: 'navigation', message: screen, level: 'info' });
  Sentry.setTag('screen', screen);
}

/** The last few screens visited (for feedback, so we can see where someone was). */
export const recentScreens: string[] = [];
export function rememberScreen(path: string) {
  const screen = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/[A-Za-z0-9]{10,}(?=\/|$)/g, '/:code');
  if (recentScreens[recentScreens.length - 1] !== screen) recentScreens.push(screen);
  if (recentScreens.length > 8) recentScreens.shift();
}

/** Feedback also lands in Sentry's User Feedback inbox (which emails the team). */
export function sendFeedbackToSentry(message: string, kind: string, context: Record<string, unknown>) {
  if (!sentryEnabled) return;
  Sentry.captureFeedback({ message, tags: { feedback_kind: kind, screen: String(context.screen ?? '') } }, { captureContext: { extra: context } });
}

export function setCrashUser(userId: string | null) {
  if (!sentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function reportError(error: unknown) {
  if (!sentryEnabled) return;
  Sentry.captureException(error);
}

export { Sentry };
