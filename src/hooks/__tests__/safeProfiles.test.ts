/**
 * A member or player whose profile you can't see (blocked, deleted account) comes back with
 * profile: null, including in data saved on the phone by an older version. Screens must get a
 * neutral "Player" instead of crashing.
 */
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/api', () => ({ q: jest.fn(), rpc: jest.fn() }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({}) }));
jest.mock('../useRealtime', () => ({ useRealtimeInvalidate: jest.fn() }));
import { safeGroupDetail, safeSessionDetail } from '../queries';

const me = { id: 'a', username: 'sam', display_name: 'Sam', avatar_url: null, position: 'MID' };

it('group: hidden members become "Player", owners first, nothing crashes', () => {
  const d: any = {
    group: { id: 'g' }, settings: null, seasons: [], myRole: 'owner', myRemoval: null,
    members: [{ user_id: 'x', role: 'member', joined_at: '', profile: null }, { user_id: 'a', role: 'owner', joined_at: '', profile: me }],
    joinRequests: [{ id: 'r', user_id: 'y', profile: null }],
    removals: [{ user_id: 'z', profile: null }],
  };
  const s = safeGroupDetail(d);
  expect(s.members.map((m: any) => [m.user_id, m.profile.display_name])).toEqual([['a', 'Sam'], ['x', 'Player']]);
  expect(s.joinRequests[0].profile).toMatchObject({ id: 'y', display_name: 'Player', avatar_url: null });
  expect(s.removals).toEqual([]);
});

it('game: hidden players in the squad become "Player"', () => {
  const s = safeSessionDetail({ attendance: [{ user_id: 'x', status: 'confirmed', profile: null }], invited: [null, me] } as any);
  expect(s.attendance[0].profile.display_name).toBe('Player');
  expect(s.invited).toEqual([me]);
});
