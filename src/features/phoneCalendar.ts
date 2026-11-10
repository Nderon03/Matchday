import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import type { CalendarEvent } from './calendar';

/**
 * One tap on a phone: the game goes straight into the phone's own calendar (the main writable
 * calendar, usually the Google account's), with a reminder 2 hours before kick-off.
 */
export async function addToPhoneCalendar(e: CalendarEvent): Promise<'added' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const { status } = await Calendar.requestCalendarPermissions();
    if (status !== 'granted') return 'denied';
    const writable = (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter((c) => c.allowsModifications && c.isVisible !== false);
    const cal = writable.find((c) => c.isPrimary) ?? writable[0];
    if (!cal) return 'unavailable';
    const start = new Date(e.startsAt);
    await cal.createEvent({
      title: e.title,
      startDate: start,
      endDate: new Date(start.getTime() + e.durationMinutes * 60_000),
      location: e.location ?? undefined,
      notes: e.details,
      alarms: [{ relativeOffset: -120 }],
    });
    return 'added';
  } catch {
    return 'unavailable';
  }
}
