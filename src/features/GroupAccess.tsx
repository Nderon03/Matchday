import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SwipeSelect } from '@/components/ui';
import type { GroupJoinPolicy, GroupVisibility } from '@/types/db';

/** One plain choice instead of separate visibility + join policy settings. */
export type GroupAccess = 'invite' | 'approval' | 'open';

export const GROUP_ACCESS: { value: GroupAccess; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'invite', title: 'Invite only', icon: 'lock-closed-outline',
    detail: 'Hidden from Discover. People join with an invite from a member. Best for your regular mates.' },
  { value: 'approval', title: 'Ask to join', icon: 'hand-left-outline',
    detail: 'Listed in Discover. Anyone can ask to join and an admin approves.' },
  { value: 'open', title: 'Open', icon: 'globe-outline',
    detail: 'Listed in Discover. Anyone can join straight away.' },
];

export function accessToSettings(a: GroupAccess): { visibility: GroupVisibility; join_policy: GroupJoinPolicy } {
  if (a === 'open') return { visibility: 'public', join_policy: 'open' };
  if (a === 'approval') return { visibility: 'public', join_policy: 'request' };
  return { visibility: 'private', join_policy: 'request' };
}

export function accessOf(g: { visibility: GroupVisibility; join_policy: GroupJoinPolicy }): GroupAccess {
  if (g.visibility === 'private' || g.join_policy === 'invite_only') return 'invite';
  return g.join_policy === 'open' ? 'open' : 'approval';
}

/** Who can join, as one swipeable choice. */
export function GroupAccessPicker({ value, onChange }: { value: GroupAccess; onChange: (a: GroupAccess) => void }) {
  return (
    <SwipeSelect label="Who can join" value={value} onChange={onChange}
      options={GROUP_ACCESS.map((o) => ({ value: o.value, label: o.title, detail: o.detail, icon: o.icon }))} />
  );
}
