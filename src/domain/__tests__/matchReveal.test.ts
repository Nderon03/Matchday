import { matchHighlights, pendingReveals, highlightText, type MatchReveal } from '../matchReveal';

const base: MatchReveal = {
  session_id: 's', name: 'Wednesday Football', played_at: '2026-11-04T19:00:00Z', finalised_at: '2026-11-04T22:00:00Z', group_name: null,
  fixtures_played: 3, wins: 2, draws: 0, losses: 1, goals: 1, assists: 0, rating_avg: '7.20', rating_eligible: true,
  motm: false, motm_shared: false, prev_max_goals: 2, prev_max_assists: 1, prev_best_rating: '7.80', prev_rated: 6,
};

describe('match highlights', () => {
  it('an ordinary game has none', () => expect(matchHighlights(base)).toEqual([]));
  it('calls out MOTM and new bests', () => {
    expect(matchHighlights({ ...base, motm: true, goals: 3, assists: 2, rating_avg: '8.4' })).toEqual([
      { kind: 'motm', shared: false }, { kind: 'goals_pb', value: 3 }, { kind: 'assists_pb', value: 2 }, { kind: 'rating_pb', value: 8.4 },
    ]);
  });
  it('one goal is never a "record", and equalling a best is not beating it', () => {
    expect(matchHighlights({ ...base, goals: 1, prev_max_goals: 0 })).toEqual([]);
    expect(matchHighlights({ ...base, goals: 2, prev_max_goals: 2 })).toEqual([]);
  });
  it('rating bests need a few rated games first', () => {
    expect(matchHighlights({ ...base, rating_avg: 9, prev_rated: 2 })).toEqual([]);
    expect(matchHighlights({ ...base, rating_avg: 9, rating_eligible: false })).toEqual([]);
  });
  it('words', () => expect(highlightText({ kind: 'motm', shared: true }).title).toBe('Joint Man of the Match'));
});

describe('pending reveals', () => {
  const r = (id: string, at: string) => ({ ...base, session_id: id, finalised_at: at });
  it('shows the newest two unseen and skips older ones', () => {
    const all = [r('a', '2026-11-01'), r('b', '2026-11-02'), r('c', '2026-11-03'), r('d', '2026-11-04')];
    const p = pendingReveals(all, ['d']);
    expect(p.show.map((x) => x.session_id)).toEqual(['b', 'c']);
    expect(p.skip.map((x) => x.session_id)).toEqual(['a']);
  });
});
