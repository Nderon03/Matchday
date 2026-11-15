import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { rpc } from './api';
import { env } from './env';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/** Ask for permission and register this device's Expo push token with the backend. */
export async function registerForPush(): Promise<'registered' | 'denied' | 'unsupported'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MATCHDAY',
      // eslint-disable-next-line import/namespace -- re-exported enum; resolved correctly by TypeScript
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#22C55E',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const projectId = env.easProjectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return 'unsupported';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  return 'registered';
}

export { routeForNotification } from './notificationRoutes';

/** Open the right screen when a push notification is tapped. Returns an unsubscribe. */
export function onNotificationTap(go: (data: Record<string, any>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => go(res.notification.request.content.data as Record<string, any>));
  return () => sub.remove();
}
