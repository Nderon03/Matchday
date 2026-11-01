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
 * How goalkeepers are handled:
 *  - auto: a keeper per side only if at least two players' preferred position is GK
 *  - rotating: no fixed keepers (common in casual football) — everyone is treated as outfield
 *  - fixed: also count players who have kept goal before (2+ games in goal)
 */
export type GoalkeeperMode = 'auto' | 'rotating' | 'fixed';

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
  if (mode === 'rotating') return false;
  return p.position === 'GK' || (mode === 'fixed' && (p.gk_games ?? 0) >= 2);
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

function chooseKeepers(players: BalancePlayer[], mode: GoalkeeperMode = 'auto') {
  const keepers = players.filter((p) => isKeeper(p, mode)).sort((a, b) => (b.gk_games ?? 0) - (a.gk_games ?? 0) || playerStrength(b) - playerStrength(a));
  return keepers.length >= 2 ? [keepers[0], keepers[1]] : [];
}

function cost(
  a: BalancePlayer[],
  b: BalancePlayer[],
  pairs: Map<string, number>,
  positionWeight: number,
  pairingWeight: number,
) {
  const sa = a.reduce((s, p) => s + playerStrength(p), 0);
  const sb = b.reduce((s, p) => s + playerStrength(p), 0);
  let posPenalty = 0;
  for (const pos of ['DEF', 'MID', 'FWD'] as const) {
    posPenalty += Math.abs(a.filter((p) => p.position === pos).length - b.filter((p) => p.position === pos).length);
  }
  let pairPenalty = 0;
  for (const team of [a, b]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        pairPenalty += pairs.get(pairKey(team[i].user_id, team[j].user_id)) ?? 0;
      }
    }
  }
  return { total: Math.abs(sa - sb) + positionWeight * Math.max(0, posPenalty - 1) + pairingWeight * pairPenalty, sa, sb };
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
  const keeperIds = new Set(keepers.map((k) => k.user_id));
  // shuffle first so equal-cost solutions vary week to week
  const outfield = shuffle(players.filter((p) => !keeperIds.has(p.user_id)), random);
  const kA = keepers[0] ? [keepers[0]] : [];
  const kB = keepers[1] ? [keepers[1]] : [];

  const total = players.length;
  const sizeA = Math.ceil(total / 2) - kA.length;

  let best: { a: BalancePlayer[]; b: BalancePlayer[]; c: ReturnType<typeof cost> } | null = null;
  const consider = (a: BalancePlayer[], b: BalancePlayer[]) => {
    const c = cost([...kA, ...a], [...kB, ...b], pairs, positionWeight, pairingWeight);
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
    explanation:
      'Suggested teams based on previous performances and player balance' +
      (keepers.length === 2 ? ', with a goalkeeper on each side.' : opts.goalkeepers === 'rotating' ? '. Goalkeepers rotate, so nobody is fixed in goal.' : '.'),
  };
}

/** Random allocation (used when there is too little history, or on request). */
export function randomTeams(players: BalancePlayer[], seedOrRandom?: number | (() => number), goalkeepers: GoalkeeperMode = 'auto'): BalanceResult {
  const random = typeof seedOrRandom === 'number' ? mulberry(seedOrRandom) : seedOrRandom ?? Math.random;
  const keepers = chooseKeepers(players, goalkeepers);
  const keeperIds = new Set(keepers.map((k) => k.user_id));
  const rest = shuffle(players.filter((p) => !keeperIds.has(p.user_id)), random);
  const sizeA = Math.ceil(players.length / 2) - (keepers[0] ? 1 : 0);
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
    explanation: 'Random teams.',
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
