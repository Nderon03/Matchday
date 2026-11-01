/** MOTM decision rules (mirrors public.decide_motm). Never invents a winner. */
export interface MotmVote {
  voterId: string;
  nomineeId: string;
}

export interface MotmOutcome {
  winners: string[];
  votes: number;
  shared: boolean;
  decidedByHost: boolean;
  tally: Record<string, number>;
}

export function decideMotm(votes: MotmVote[], eligibleVoters: Set<string>, tiebreak?: string | null): MotmOutcome {
  const tally: Record<string, number> = {};
  const seen = new Set<string>();
  for (const v of votes) {
    if (!eligibleVoters.has(v.voterId) || v.voterId === v.nomineeId || seen.has(v.voterId)) continue;
    seen.add(v.voterId);
    tally[v.nomineeId] = (tally[v.nomineeId] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  if (max === 0) return { winners: [], votes: 0, shared: false, decidedByHost: false, tally };
  const leaders = Object.keys(tally).filter((k) => tally[k] === max).sort();
  if (leaders.length > 1 && tiebreak && leaders.includes(tiebreak)) {
    return { winners: [tiebreak], votes: max, shared: false, decidedByHost: true, tally };
  }
  return { winners: leaders, votes: max, shared: leaders.length > 1, decidedByHost: false, tally };
}
