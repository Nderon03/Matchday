/**
 * Team balancing. Produces two teams whose expected strength is as close as possible,
 * while spreading goalkeepers and positions and avoiding repeating last week's pairings.
 * Never finalises anything: the host always confirms.
 */
import type { PlayerPosition } from '@/types/db';

export interface BalancePlayer {
  user_id: string;
  position: PlayerPosition;
  group_rating?: number | null;
  career_rating?: number | null;
  form?: number | null;
  games?: number | null;
  gk_games?: number | null;
  win_pct?: number | null;
}

/**
 * How goalkeepers are handled. Keepers are players whose preferred position is GK.
 *  - auto: 2+ keepers → one per side; 1 keeper → on one side, and the other side (which rotates
 *    in goal) gets an extra defender and a slightly stronger squad; 0 keepers → everyone rotates.
 *  - rotating: keepers play outfield today; everyone rotates in goal.
 *  ('fixed' is kept for older callers and behaves like 'auto'.)
 */
export type GoalkeeperMode = 'auto' | 'rotating' | 'fixed';

/** Rating points the rotating side gets on top when only one team has a keeper. */
export const ONE_KEEPER_EDGE = 0.6;
/** Cost (in rating points) of each defender the rotating side is short of. */
const DEFENCE_WEIGHT = 1.5;

export interface BalanceOptions {
  goalkeepers?: GoalkeeperMode;
  /** Pairs [a, b] who were teammates recently, with counts. */
  recentPairings?: { user_a: string; user_b: string; times: number }[];
  /** Deterministic randomness for tests. */
  random?: () => number;
  /** Weight applied to position imbalance (in rating points per unit of imbalance). */
  positionWeight?: number;
  pairingWeight?: number;
}

export interface BalanceResult {
  A: string[];
  B: string[];
  goalkeepers: { A?: string; B?: string };
  strengthA: number;
  strengthB: number;
  difference: number;
  method: 'balanced' | 'random';
  /** How many fixed keepers were used: 0 (both rotate), 1 (team B rotates) or 2 (one each). */
  keeperCase: 0 | 1 | 2;
  explanation: string;
}

const PRIOR = 6.0; // neutral rating for unknown players
const PRIOR_WEIGHT = 3; // games of evidence before history dominates

/** Expected strength: group rating > career rating, blended with form, shrunk to the prior for new players. */
export function playerStrength(p: BalancePlayer): number {
  const base = p.group_rating ?? p.career_rating ?? null;
  const games = Math.max(0, p.games ?? 0);
  if (base == null) return PRIOR;
  const blended = p.form != null ? 0.7 * Number(base) + 0.3 * Number(p.form) : Number(base);
  return (games * blended + PRIOR_WEIGHT * PRIOR) / (games + PRIOR_WEIGHT);
}

/** Enough history to make a meaningful suggestion: at least half of the players have rated games. */
export function hasEnoughHistory(players: BalancePlayer[]): boolean {
  if (players.length < 2) return false;
  const known = players.filter((p) => (p.games ?? 0) >= 1 && (p.group_rating ?? p.career_rating) != null).length;
  return known >= Math.ceil(players.length / 2);
}

function isKeeper(p: BalancePlayer, mode: GoalkeeperMode) {
  return mode !== 'rotating' && p.position === 'GK';
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], random: () => number = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Up to two keepers (players who chose GK), best first. */
export function chooseKeepers(players: BalancePlayer[], mode: GoalkeeperMode = 'auto') {
  const keepers = players.filter((p) => isKeeper(p, mode)).sort((a, b) => playerStrength(b) - playerStrength(a) || (b.gk_games ?? 0) - (a.gk_games ?? 0));
  return keepers.slice(0, 2);
}

/** Team sizes (including keepers). With one keeper and an odd squad, the rotating side gets the extra player. */
function sizes(total: number, keeperCount: number) {
  const a = keeperCount === 1 ? Math.floor(total / 2) : Math.ceil(total / 2);
  return { a, b: total - a };
}

/** Short goalkeeper note (used for random teams). */
export function keeperNote(keeperCase: 0 | 1 | 2, rotatingMode = false) {
  if (rotatingMode || keeperCase === 0) return 'Both teams rotate in goal.';
  if (keeperCase === 1) return 'One goalkeeper, so the other team rotates in goal.';
  return 'One goalkeeper on each side.';
}

export function keeperExplanation(keeperCase: 0 | 1 | 2, rotatingMode = false) {
  if (rotatingMode) return 'Keepers are playing outfield today, so both teams rotate in goal. Teams are balanced on ratings and positions.';
  if (keeperCase === 2) return 'Balanced on ratings and positions, with a goalkeeper on each side.';
  if (keeperCase === 1) return 'Only one goalkeeper, so the other team rotates in goal. To make up for it they get an extra defender and a slightly stronger squad.';
  return 'No goalkeepers, so both teams rotate in goal. Teams are balanced on ratings and positions.';
}

/**
 * a / b are whole teams (keepers included). keeperCase 1 means team A has the only keeper:
 * team B should then be ONE_KEEPER_EDGE stronger and have at least one more defender.
 */
function cost(
  a: BalancePlayer[],
  b: BalancePlayer[],
  pairs: Map<string, number>,
  positionWeight: number,
  pairingWeight: number,
  keeperCase: 0 | 1 | 2 = 0,
  defendersAvailable = 0,
) {
  const sa = a.reduce((s, p) => s + playerStrength(p), 0);
  const sb = b.reduce((s, p) => s + playerStrength(p), 0);
  const count = (team: BalancePlayer[], pos: PlayerPosition) => team.filter((p) => p.position === pos).length;
  let posPenalty = 0;
  for (const pos of ['MID', 'FWD'] as const) posPenalty += Math.abs(count(a, pos) - count(b, pos));
  let defencePenalty = 0;
  if (keeperCase === 1) {
    // the rotating side needs the extra defender (when there are defenders to give)
    const wanted = Math.min(defendersAvailable, count(a, 'DEF') + 1);
    defencePenalty = Math.max(0, wanted - count(b, 'DEF')) + Math.max(0, count(b, 'DEF') - count(a, 'DEF') - 2);
  } else {
    posPenalty += Math.abs(count(a, 'DEF') - count(b, 'DEF'));
  }
  let pairPenalty = 0;
  for (const team of [a, b]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        pairPenalty += pairs.get(pairKey(team[i].user_id, team[j].user_id)) ?? 0;
      }
    }
  }
  const strengthGap = keeperCase === 1 ? Math.abs(sa + ONE_KEEPER_EDGE - sb) : Math.abs(sa - sb);
  return { total: strengthGap + positionWeight * Math.max(0, posPenalty - 1) + DEFENCE_WEIGHT * defencePenalty + pairingWeight * pairPenalty, sa, sb };
}

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

function combinations(n: number, k: number, visit: (idx: number[]) => void) {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    visit(idx);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * Balance players into two teams. Exhaustive search for up to 16 outfield players,
 * otherwise a snake draft followed by pairwise-swap hill climbing.
 */
export function balanceTeams(players: BalancePlayer[], opts: BalanceOptions = {}): BalanceResult {
  const random = opts.random ?? Math.random;
  const positionWeight = opts.positionWeight ?? 0.25;
  const pairingWeight = opts.pairingWeight ?? 0.05;
  const pairs = new Map<string, number>();
  for (const p of opts.recentPairings ?? []) pairs.set(pairKey(p.user_a, p.user_b), p.times);

  const keepers = chooseKeepers(players, opts.goalkeepers);
  const keeperCase = keepers.length as 0 | 1 | 2;
  const keeperIds = new Set(keepers.map((k) => k.user_id));
  // shuffle first so equal-cost solutions vary week to week; extra GK-preferring players play outfield
  const outfield = shuffle(players.filter((p) => !keeperIds.has(p.user_id)), random)
    .map((p) => (p.position === 'GK' ? { ...p, position: 'ANY' as PlayerPosition } : p));
  const kA = keepers[0] ? [keepers[0]] : [];
  const kB = keepers[1] ? [keepers[1]] : [];
  const defendersAvailable = outfield.filter((p) => p.position === 'DEF').length;

  const total = players.length;
  const sizeA = sizes(total, keeperCase).a - kA.length;

  let best: { a: BalancePlayer[]; b: BalancePlayer[]; c: ReturnType<typeof cost> } | null = null;
  const consider = (a: BalancePlayer[], b: BalancePlayer[]) => {
    const c = cost([...kA, ...a], [...kB, ...b], pairs, positionWeight, pairingWeight, keeperCase, defendersAvailable);
    if (!best || c.total < best.c.total - 1e-9) best = { a, b, c };
  };

  if (outfield.length <= 16) {
    combinations(outfield.length, Math.max(0, Math.min(sizeA, outfield.length)), (idx) => {
      const set = new Set(idx);
      consider(outfield.filter((_, i) => set.has(i)), outfield.filter((_, i) => !set.has(i)));
    });
  } else {
    const sorted = [...outfield].sort((x, y) => playerStrength(y) - playerStrength(x));
    let a: BalancePlayer[] = [];
    let b: BalancePlayer[] = [];
    sorted.forEach((p, i) => ((i % 4 === 0 || i % 4 === 3) && a.length < sizeA ? a : b).push(p));
    while (a.length < sizeA && b.length) a.push(b.pop()!);
    consider(a, b);
    let improved = true;
    while (improved) {
      improved = false;
      const cur = best!;
      for (let i = 0; i < cur.a.length && !improved; i++) {
        for (let j = 0; j < cur.b.length && !improved; j++) {
          const na = [...cur.a];
          const nb = [...cur.b];
          [na[i], nb[j]] = [nb[j], na[i]];
          const before = cur.c.total;
          consider(na, nb);
          if (best!.c.total < before - 1e-9) improved = true;
        }
      }
    }
  }

  const res = best!;
  const A = [...kA, ...res.a].map((p) => p.user_id);
  const B = [...kB, ...res.b].map((p) => p.user_id);
  const difference = Math.abs(res.c.sa - res.c.sb);
  return {
    A,
    B,
    goalkeepers: { A: kA[0]?.user_id, B: kB[0]?.user_id },
    strengthA: round2(res.c.sa),
    strengthB: round2(res.c.sb),
    difference: round2(difference),
    method: 'balanced',
    keeperCase,
    explanation: keeperExplanation(keeperCase, opts.goalkeepers === 'rotating'),
  };
}

/** Random allocation (used when there is too little history, or on request). */
export function randomTeams(players: BalancePlayer[], seedOrRandom?: number | (() => number), goalkeepers: GoalkeeperMode = 'auto'): BalanceResult {
  const random = typeof seedOrRandom === 'number' ? mulberry(seedOrRandom) : seedOrRandom ?? Math.random;
  const keepers = chooseKeepers(players, goalkeepers);
  const keeperCase = keepers.length as 0 | 1 | 2;
  const keeperIds = new Set(keepers.map((k) => k.user_id));
  const rest = shuffle(players.filter((p) => !keeperIds.has(p.user_id)), random);
  const sizeA = sizes(players.length, keeperCase).a - (keepers[0] ? 1 : 0);
  const a = [...(keepers[0] ? [keepers[0]] : []), ...rest.slice(0, sizeA)];
  const b = [...(keepers[1] ? [keepers[1]] : []), ...rest.slice(sizeA)];
  const sa = a.reduce((s, p) => s + playerStrength(p), 0);
  const sb = b.reduce((s, p) => s + playerStrength(p), 0);
  return {
    A: a.map((p) => p.user_id),
    B: b.map((p) => p.user_id),
    goalkeepers: { A: keepers[0]?.user_id, B: keepers[1]?.user_id },
    strengthA: round2(sa),
    strengthB: round2(sb),
    difference: round2(Math.abs(sa - sb)),
    method: 'random',
    keeperCase,
    explanation: `Random teams. ${keeperNote(keeperCase, goalkeepers === 'rotating')}`,
  };
}

/** Suggest teams: balanced when there is enough history, otherwise random. */
export function suggestTeams(players: BalancePlayer[], opts: BalanceOptions = {}): BalanceResult {
  if (!hasEnoughHistory(players)) {
    const r = randomTeams(players, opts.random, opts.goalkeepers);
    return { ...r, explanation: 'Not enough match history yet, so these teams are random. Adjust them as you like.' };
  }
  return balanceTeams(players, opts);
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * For the next game on the same night: treat last game's teammates as having played together a
 * lot, so balanced teams come out fair but mixed up (not the same two teams again).
 */
export function mixAfterLastGame(
  pairings: { user_a: string; user_b: string; times: number }[],
  last: { A: string[]; B: string[] } | null,
  weight = 4,
) {
  if (!last) return pairings;
  const extra: { user_a: string; user_b: string; times: number }[] = [];
  for (const side of [last.A, last.B]) {
    for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) extra.push({ user_a: side[i], user_b: side[j], times: weight });
  }
  return [...pairings, ...extra];
}
