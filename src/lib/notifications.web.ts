/**
 * The website has no push notifications: these stand in for src/lib/notifications.ts so the web
 * version never loads the phone-only notifications library (which warns in the browser console).
 */
export { routeForNotification } from './notificationRoutes';

export async function registerForPush(): Promise<'registered' | 'denied' | 'unsupported'> {
  return 'unsupported';
}

export function onNotificationTap(_go: (data: Record<string, any>) => void): () => void {
  return () => undefined;
}
