import { decideMotm } from '../motm';
import { newlyUnlocked, ACHIEVEMENTS } from '../achievements';
import { rank, formatValue } from '../leaderboard';
import { validateGoalClaim, sessionSchema, signUpSchema, fieldErrors } from '../validation';
import { formatPence, poundsToPence, timeUntil, formatKickoff } from '../format';

describe('MOTM', () => {
  const voters = new Set(['a', 'b', 'c', 'd']);
  it('highest total wins', () => {
    const r = decideMotm([{ voterId: 'a', nomineeId: 'b' }, { voterId: 'c', nomineeId: 'b' }, { voterId: 'b', nomineeId: 'a' }], voters);
    expect(r).toMatchObject({ winners: ['b'], votes: 2, shared: false });
  });
  it('ignores self votes, duplicates and ineligible voters', () => {
    const r = decideMotm(
      [{ voterId: 'a', nomineeId: 'a' }, { voterId: 'b', nomineeId: 'c' }, { voterId: 'b', nomineeId: 'd' }, { voterId: 'zz', nomineeId: 'd' }],
      voters,
    );
    expect(r.tally).toEqual({ c: 1 });
  });
  it('ties are shared unless the host breaks them', () => {
    const votes = [{ voterId: 'a', nomineeId: 'b' }, { voterId: 'b', nomineeId: 'a' }];
    expect(decideMotm(votes, voters)).toMatchObject({ winners: ['a', 'b'], shared: true });
    expect(decideMotm(votes, voters, 'b')).toMatchObject({ winners: ['b'], decidedByHost: true });
    expect(decideMotm(votes, voters, 'd')).toMatchObject({ shared: true }); // invalid tiebreak ignored
  });
  it('no votes, no winner', () => expect(decideMotm([], voters).winners).toEqual([]));
});

describe('achievements', () => {
  const base = { sessions: 0, goals: 0, motm: 0, bestWinStreak: 0, bestUnbeaten: 0, maxGoalsInSession: 0, seasonChampion: false };
  it('unlocks on thresholds', () => {
    expect(newlyUnlocked({ ...base, sessions: 1, goals: 3, maxGoalsInSession: 3 }, [])).toEqual(['first_match', 'first_goal', 'hat_trick']);
    expect(newlyUnlocked({ ...base, sessions: 50, motm: 10, goals: 100, bestWinStreak: 5, bestUnbeaten: 10, seasonChampion: true }, []))
      .toEqual(expect.arrayContaining(['apps_50', 'motm_10', 'goals_100', 'win_streak_5', 'unbeaten_10', 'season_champion']));
  });
  it('never awards twice', () => expect(newlyUnlocked({ ...base, sessions: 2 }, ['first_match'])).toEqual([]));
  it('progress caps at target', () => {
    const apps = ACHIEVEMENTS.find((a) => a.code === 'apps_50')!;
    expect(apps.progress({ ...base, sessions: 70 })).toEqual([50, 50]);
  });
});

describe('leaderboard ranking', () => {
  it('uses competition ranking and minimum appearances', () => {
    const r = rank(
      [
        { userId: 'a', value: 100, appearances: 1 },
        { userId: 'b', value: 75, appearances: 8 },
        { userId: 'c', value: 75, appearances: 8 },
        { userId: 'd', value: 60, appearances: 10 },
      ],
      { minAppearances: 5 },
    );
    expect(r.map((x) => [x.userId, x.rank])).toEqual([['b', 1], ['c', 1], ['d', 3]]);
  });
  it('formats values', () => {
    expect(formatValue('win_pct', 66.666)).toBe('66.7%');
    expect(formatValue('improved', 0.5)).toBe('+0.50');
    expect(formatValue('goals', 12)).toBe('12');
  });
});

describe('validation', () => {
  it('goal claims cannot exceed team goals', () => {
    expect(validateGoalClaim(3, [2, 0])).toMatch(/more goals/);
    expect(validateGoalClaim(2, [2, 1], [{ goals: 2, teamScore: 1 }])).toMatch(/in a game/);
    expect(validateGoalClaim(2, [2, 1], [{ goals: 1, teamScore: 2 }])).toMatch(/add up/);
    expect(validateGoalClaim(2, [2, 1], [{ goals: 1, teamScore: 2 }, { goals: 1, teamScore: 1 }])).toBeNull();
  });
  it('session schema enforces paid minimum and group visibility', () => {
    const base = {
      name: 'Wednesday Football', starts_at: new Date(Date.now() + 86400_000), duration_minutes: 60, format_size: 7, max_attendance: 14,
      visibility: 'group' as const, payment_mode: 'upfront' as const, price_pence: 50, group_id: null, invitee_ids: [],
    };
    const r = sessionSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(['price_pence', 'visibility']);
  });
  it('sign up validation', () => {
    expect(signUpSchema.safeParse({ email: 'x@y.com', password: 'abcdefg1', username: 'jo_123', displayName: 'Jo' }).success).toBe(true);
    expect(signUpSchema.safeParse({ email: 'nope', password: 'short', username: 'a b', displayName: '' }).success).toBe(false);
  });
});

describe('format', () => {
  it('money', () => {
    expect(formatPence(600)).toBe('£6');
    expect(formatPence(650)).toBe('£6.50');
    expect(poundsToPence('£6.50')).toBe(650);
    expect(poundsToPence('abc')).toBeNull();
  });
  it('relative times', () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime();
    expect(timeUntil('2026-11-04T14:30:00Z', now)).toBe('2h 30m');
    expect(timeUntil('2026-11-01T00:00:00Z', now)).toBe('closed');
    expect(formatKickoff(new Date(now + 60_000).toISOString(), new Date(now))).toMatch(/^Today/);
  });
});
