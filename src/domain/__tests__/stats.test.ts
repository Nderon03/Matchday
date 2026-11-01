import {
  winPercentage, minRatingsRequired, sessionRating, careerRating, recentForm, streaks, sessionSummary, improvement, careerTotals, highestRating,
} from '../stats';

describe('winPercentage', () => {
  it('handles zero fixtures', () => expect(winPercentage(0, 0)).toBe(0));
  it('rounds to one decimal', () => expect(winPercentage(2, 3)).toBe(66.7));
  it('100% for all wins', () => expect(winPercentage(4, 4)).toBe(100));
});

describe('rating threshold', () => {
  it.each([
    [2, 1], [3, 2], [4, 2], [6, 2], [8, 3], [10, 4], [14, 5], [22, 5],
  ])('%i participants → %i ratings', (n, expected) => expect(minRatingsRequired(n)).toBe(expected));
  it('respects a group override', () => expect(minRatingsRequired(10, 1)).toBe(1));
});

describe('sessionRating', () => {
  it('averages valid ratings to 2dp', () => expect(sessionRating([7, 8, 8], 10).rating).toBe(7.67));
  it('ignores invalid scores', () => expect(sessionRating([0, 11, 6, 8], 4)).toEqual({ rating: 7, eligible: true, count: 2 }));
  it('is ineligible below the threshold', () => expect(sessionRating([9], 10).eligible).toBe(false));
  it('null without ratings', () => expect(sessionRating([], 10).rating).toBeNull());
});

describe('careerRating', () => {
  it('weights each eligible session equally', () => {
    // a session with 9 voters at 9.0 and a session with 2 voters at 5.0 average to 7.0
    expect(careerRating([{ rating_avg: 9, rating_eligible: true }, { rating_avg: 5, rating_eligible: true }])).toBe(7);
  });
  it('skips ineligible sessions', () => {
    expect(careerRating([{ rating_avg: 10, rating_eligible: false }, { rating_avg: 6, rating_eligible: true }])).toBe(6);
  });
  it('returns null when nothing is eligible', () => expect(careerRating([])).toBeNull());
});

describe('recentForm', () => {
  const rows = [6, 7, 8, 9, 10, 4].map((r, i) => ({ rating_avg: r, rating_eligible: true, played_at: `2026-01-0${i + 1}` }));
  it('uses the last five eligible sessions', () => expect(recentForm(rows)).toBe(7.6)); // 7,8,9,10,4
  it('highest rating', () => expect(highestRating(rows)).toBe(10));
  it('improvement compares halves', () => expect(improvement(rows)).toBe(0.67)); // (9+10+4)/3 - (6+7+8)/3
  it('improvement needs enough sessions', () => expect(improvement(rows.slice(0, 4))).toBeNull());
});

describe('streaks', () => {
  it('computes current and best streaks', () => {
    expect(streaks(['W', 'W', 'D', 'W', 'W', 'W', 'L', 'W'])).toEqual({ currentWin: 1, bestWin: 3, currentUnbeaten: 1, bestUnbeaten: 6 });
  });
  it('empty history', () => expect(streaks([])).toEqual({ currentWin: 0, bestWin: 0, currentUnbeaten: 0, bestUnbeaten: 0 }));
});

describe('sessionSummary', () => {
  it('counts a multi-fixture session as one appearance', () => {
    const s = sessionSummary([
      { fixtureId: '1', myScore: 3, theirScore: 2 },
      { fixtureId: '2', myScore: 1, theirScore: 4 },
      { fixtureId: '3', myScore: 5, theirScore: 3 },
      { fixtureId: '4', myScore: 2, theirScore: 2 },
    ]);
    expect(s).toEqual({ appearances: 1, fixturesPlayed: 4, wins: 2, draws: 1, losses: 1, goalsFor: 11, goalsAgainst: 11 });
  });
});

describe('careerTotals', () => {
  it('combines rows', () => {
    const base = { draws: 0, assists: 0, rating_eligible: true };
    const t = careerTotals([
      { ...base, played_at: '2026-01-01', fixtures_played: 3, wins: 2, losses: 1, goals: 4, rating_avg: 7, motm: true },
      { ...base, played_at: '2026-01-08', fixtures_played: 1, wins: 0, losses: 1, goals: 0, rating_avg: 6, motm: false },
    ]);
    expect(t).toMatchObject({ sessions: 2, fixtures: 4, wins: 2, losses: 2, goals: 4, motm: 1, rating: 6.5, winPct: 50 });
  });
});
