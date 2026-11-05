import type { useConfirm } from '@/components/ui';
import type { SessionGuest } from '@/hooks/queries';
import { rpc } from '@/lib/api';

type Run = <T>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string)) => Promise<T | undefined>;

/**
 * Host removes a player. If they brought guests, the confirmation offers to remove those too.
 * Removed players can only rejoin when re-invited.
 */
export async function removeSessionPlayer({ confirm, run, sessionId, userId, name, guests }: {
  confirm: ReturnType<typeof useConfirm>;
  run: Run;
  sessionId: string;
  userId: string;
  name: string;
  guests: SessionGuest[];
}) {
  const theirGuests = guests.filter((g) => g.added_by === userId && (g.status === 'confirmed' || g.status === 'pending'));
  const r = await confirm({
    title: `Remove ${name}?`,
    message: 'They’ll be taken out of the squad and line-ups, and can only rejoin if you invite them again. They’ll be told straight away.',
    confirmLabel: 'Remove',
    destructive: true,
    reasonLabel: 'Reason (optional, shown to them)',
    checkboxLabel: theirGuests.length
      ? `Also remove their guest${theirGuests.length > 1 ? 's' : ''}: ${theirGuests.map((g) => g.name).join(', ')}`
      : undefined,
    checkboxDefault: true,
  });
  if (!r) return;
  const reason = typeof r === 'object' ? r.reason || null : null;
  const removeGuests = typeof r === 'object' && theirGuests.length > 0 && r.checked;
  await run(`rm-${userId}`, () => rpc('remove_session_player', { p_session: sessionId, p_user: userId, p_reason: reason, p_remove_guests: removeGuests }),
    removeGuests ? `${name} and their guest${theirGuests.length > 1 ? 's' : ''} removed` : `${name} removed`);
}

/** Admin removes a member from a group; they can only come back when an admin re-admits them. */
export async function removeGroupMember({ confirm, run, groupId, userId, name }: {
  confirm: ReturnType<typeof useConfirm>;
  run: Run;
  groupId: string;
  userId: string;
  name: string;
}) {
  const r = await confirm({
    title: `Remove ${name} from the group?`,
    message: 'They’ll lose access to the group, be taken off its upcoming games, and can only come back if an admin invites them. They’ll be told straight away. Their past stats are kept.',
    confirmLabel: 'Remove',
    destructive: true,
    reasonLabel: 'Reason (optional, shown to them)',
  });
  if (!r) return;
  await run(`rmg-${userId}`, () => rpc('remove_group_member', { p_group: groupId, p_user: userId, p_reason: typeof r === 'object' ? r.reason || null : null }), `${name} removed`);
}
