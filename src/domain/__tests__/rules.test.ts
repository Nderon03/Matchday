import { lineupOps, arrangeOutfield } from '../lineup';
import { decideMotm } from '../motm';
import { CARD_STYLES, MAX_POINTS, TRACKS, cardStyle, medalPoints, parseCode, qualifyingCodes, rarityLabel, trackProgress } from '../achievements';
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
  it('reaches levels on thresholds', () => {
    expect(trackProgress(0, [1, 10, 25, 50, 100])).toEqual({ level: 0, next: 1, prev: 0 });
    expect(trackProgress(14, [1, 10, 25, 50, 100])).toEqual({ level: 2, next: 25, prev: 10 });
    expect(trackProgress(250, [1, 10, 25, 50, 100])).toEqual({ level: 5, next: null, prev: 100 });
  });
  it('qualifies for every level reached', () => {
    expect(qualifyingCodes({ apps: 12, goals: 1, haul: 3, season_champion: 1 }))
      .toEqual(['apps_l1', 'apps_l2', 'goals_l1', 'haul_l1', 'haul_l2', 'season_champion']);
  });
  it('parses codes', () => {
    expect(parseCode('goals_l3')).toEqual({ track: 'goals', level: 3 });
    expect(parseCode('season_champion')).toEqual({ track: 'season_champion', level: 5 });
  });
  it('medal points use the best level per track', () => {
    expect(medalPoints(['apps_l1', 'apps_l2', 'goals_l1', 'weeks_l3', 'season_champion'])).toBe(6);
    expect(medalPoints(TRACKS.map((t) => `${t.track}_l5`))).toBe(MAX_POINTS);
  });
  it('card styles get harder, and Hall of Fame needs Legend everywhere', () => {
    const pts = CARD_STYLES.map((c) => c.points);
    expect([...pts].sort((a, b) => a - b)).toEqual(pts);
    expect(cardStyle('hall_of_fame').points).toBe(MAX_POINTS);
    expect(cardStyle('nonsense').id).toBe('classic');
  });
  it('rarity only shows with enough players', () => {
    expect(rarityLabel(1, 5)).toBeNull();
    expect(rarityLabel(3, 50)).toBe('6% of players');
    expect(rarityLabel(1, 400)).toBe('Under 1% of players');
    expect(rarityLabel(0, 40)).toBe('No one yet');
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
    // goals + assists are capped by the team's goals
    expect(validateGoalClaim(2, [3], undefined, 2)).toMatch(/plus assists/);
    expect(validateGoalClaim(1, [3], undefined, 2)).toBeNull();
    expect(validateGoalClaim(1, [1, 2], [{ goals: 1, assists: 1, teamScore: 1 }, { goals: 0, assists: 0, teamScore: 2 }], 1)).toMatch(/in a game/);
    expect(validateGoalClaim(1, [1, 2], [{ goals: 1, teamScore: 1 }, { goals: 0, assists: 1, teamScore: 2 }], 2)).toMatch(/assists must add up/);
  });
  it('session schema enforces paid minimum and group visibility', () => {
    const base = {
      name: 'Wednesday Football', starts_at: new Date(Date.now() + 86400_000), duration_minutes: 60, format_size: 7, max_attendance: 14,
      visibility: 'group' as const, payment_mode: 'upfront' as const, price_pence: 50, group_id: null, invitee_ids: [], postcode: 'NW7 2EU',
    };
    const r = sessionSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(['price_pence', 'visibility']);
    const noPostcode = sessionSchema.safeParse({ ...base, visibility: 'private', payment_mode: 'free', price_pence: 0, postcode: '' });
    expect(noPostcode.success).toBe(false);
    if (!noPostcode.success) expect(Object.keys(fieldErrors(noPostcode.error))).toEqual(['postcode']);
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
    expect(formatPence(50)).toBe('50p');
    expect(formatPence(0)).toBe('£0');
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


describe('line-up operations', () => {
  const base = lineupOps.fromAssignment(['a', 'b', 'c'], ['d', 'e', 'f'], { a: 'GK' }, { A: 'a' }, 2);
  it('builds slots with goalkeeper first and overflow as substitutes', () => {
    expect(base.A.map((s) => [s.user_id, s.is_goalkeeper, s.is_substitute])).toEqual([['a', true, false], ['b', false, false], ['c', false, true]]);
  });
  it('moves players between teams and to the bench', () => {
    const moved = lineupOps.move(base, 'b', 'B', 5);
    expect(moved.A.map((s) => s.user_id)).toEqual(['a', 'c']);
    expect(moved.B.map((s) => s.user_id)).toContain('b');
    expect(lineupOps.move(base, 'd', 'bench', 5).B.map((s) => s.user_id)).toEqual(['e', 'f']);
    // full team: new arrivals become substitutes
    expect(lineupOps.move(base, 'd', 'A', 2).A.find((s) => s.user_id === 'd')?.is_substitute).toBe(true);
  });
  it('swaps players keeping slot roles', () => {
    const s = lineupOps.swap(base, 'a', 'd');
    expect(s.A[0]).toMatchObject({ user_id: 'd', is_goalkeeper: true });
    expect(s.B[0]).toMatchObject({ user_id: 'a', is_goalkeeper: false });
    // swapping with a bench player replaces them
    expect(lineupOps.swap(base, 'b', 'z').A[1].user_id).toBe('z');
  });
  it('one goalkeeper per side, toggles substitutes', () => {
    const g = lineupOps.setGoalkeeper(base, 'b');
    expect(g.A.filter((s) => s.is_goalkeeper).map((s) => s.user_id)).toEqual(['b']);
    expect(lineupOps.toggleSub(base, 'b').A[1].is_substitute).toBe(true);
  });
});

describe('pitch arrangement by position', () => {
  const p = (id: string, position: 'DEF' | 'MID' | 'FWD' | 'ANY') => ({ id, position });
  it('puts defenders, midfielders and forwards in their own lines', () => {
    const rows = arrangeOutfield([p('f', 'FWD'), p('d1', 'DEF'), p('m', 'MID'), p('d2', 'DEF')]);
    expect(rows.map((r) => r.map((x) => x.id))).toEqual([['d1', 'd2'], ['m'], ['f']]);
  });
  it('fills the thinnest line with ANY players', () => {
    const rows = arrangeOutfield([p('d1', 'DEF'), p('d2', 'DEF'), p('f', 'FWD'), p('a', 'ANY')]);
    expect(rows.map((r) => r.map((x) => x.id))).toEqual([['d1', 'd2'], ['a'], ['f']]);
  });
  it('uses a default formation when nobody has a position', () => {
    const rows = arrangeOutfield([p('a', 'ANY'), p('b', 'ANY'), p('c', 'ANY'), p('d', 'ANY')]);
    expect(rows.map((r) => r.length)).toEqual([2, 2]);
  });
  it('moving one player to FWD moves them to the front line', () => {
    const rows = arrangeOutfield([p('a', 'ANY'), p('b', 'FWD'), p('c', 'ANY')]);
    expect(rows[rows.length - 1].map((x) => x.id)).toContain('b');
  });
});

describe('setting positions', () => {
  const base = lineupOps.fromAssignment(['a', 'b', 'c'], ['d', 'e'], {}, { A: 'a' }, 5);
  it('GK makes the player the only goalkeeper on their side', () => {
    const s = lineupOps.setPosition(base, 'b', 'GK');
    expect(s.A.filter((x) => x.is_goalkeeper).map((x) => x.user_id)).toEqual(['b']);
    expect(s.B.some((x) => x.is_goalkeeper)).toBe(false);
  });
  it('an outfield position removes goalkeeper status', () => {
    const s = lineupOps.setPosition(base, 'a', 'DEF');
    expect(s.A[0]).toMatchObject({ user_id: 'a', position: 'DEF', is_goalkeeper: false });
  });
});
