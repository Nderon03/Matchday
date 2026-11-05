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

/** Route for a notification's data payload. */
export function routeForNotification(data: Record<string, any> | undefined): string | null {
  if (!data) return null;
  if (data.session_id) {
    switch (data.type) {
      case 'voting_open':
      case 'voting_reminder':
        return `/session/${data.session_id}/vote`;
      case 'goals_submit':
      case 'goals_reminder':
      case 'goals_awaiting_approval':
      case 'goals_reviewed':
        return `/session/${data.session_id}/goals`;
      case 'payment_required':
      case 'payment_reminder':
      case 'payment_failed':
      case 'payment_confirmed':
        return `/session/${data.session_id}/payments`;
      default:
        return `/session/${data.session_id}`;
    }
  }
  if (data.type === 'group_invite') return '/leagues';
  if (data.group_id) return `/group/${data.group_id}`;
  if (data.user_id) return `/player/${data.user_id}`;
  if (data.achievement) return '/profile';
  return null;
}
