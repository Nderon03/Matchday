/** Where tapping a notification takes you (shared by the phone app and the website). */
export function routeForNotification(data: Record<string, any> | undefined): string | null {
  if (!data) return null;
  if (data.recap) return '/profile';
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
