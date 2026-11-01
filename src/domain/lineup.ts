/** Line-up model and pure state transitions used by the pitch editor. */
import type { PlayerPosition } from '@/types/db';

export type Zone = 'A' | 'B' | 'bench';

export interface Slot {
  user_id: string;
  position: PlayerPosition;
  is_goalkeeper: boolean;
  is_substitute: boolean;
}

export interface LineupState {
  A: Slot[];
  B: Slot[];
}

/** Pure line-up state transitions (unit-testable). */
export const lineupOps = {
  move(state: LineupState, userId: string, to: Zone, formatSize: number): LineupState {
    const existing = [...state.A, ...state.B].find((s) => s.user_id === userId);
    const A = state.A.filter((s) => s.user_id !== userId);
    const B = state.B.filter((s) => s.user_id !== userId);
    if (to === 'bench') return { A, B };
    const target = to === 'A' ? A : B;
    const starters = target.filter((s) => !s.is_substitute).length;
    const slot: Slot = existing
      ? { ...existing, is_goalkeeper: false, is_substitute: starters >= formatSize }
      : { user_id: userId, position: 'ANY', is_goalkeeper: false, is_substitute: starters >= formatSize };
    target.push(slot);
    return { A, B };
  },
  swap(state: LineupState, a: string, b: string): LineupState {
    const find = (id: string): ['A' | 'B', number] | null => {
      const ia = state.A.findIndex((s) => s.user_id === id);
      if (ia >= 0) return ['A', ia];
      const ib = state.B.findIndex((s) => s.user_id === id);
      return ib >= 0 ? ['B', ib] : null;
    };
    const pa = find(a);
    const pb = find(b);
    const next: LineupState = { A: [...state.A], B: [...state.B] };
    if (pa && pb) {
      const sa = next[pa[0]][pa[1]];
      const sb = next[pb[0]][pb[1]];
      // each slot keeps its role (GK/sub); the players trade places
      next[pa[0]][pa[1]] = { ...sa, user_id: sb.user_id, position: sb.position };
      next[pb[0]][pb[1]] = { ...sb, user_id: sa.user_id, position: sa.position };
    } else if (pa && !pb) {
      next[pa[0]][pa[1]] = { ...next[pa[0]][pa[1]], user_id: b };
    } else if (!pa && pb) {
      next[pb[0]][pb[1]] = { ...next[pb[0]][pb[1]], user_id: a };
    }
    return next;
  },
  setGoalkeeper(state: LineupState, userId: string): LineupState {
    const apply = (slots: Slot[]) => {
      if (!slots.some((s) => s.user_id === userId)) return slots;
      return slots.map((s) => ({ ...s, is_goalkeeper: s.user_id === userId ? !s.is_goalkeeper : false, is_substitute: s.user_id === userId ? false : s.is_substitute }));
    };
    return { A: apply(state.A), B: apply(state.B) };
  },
  toggleSub(state: LineupState, userId: string): LineupState {
    const apply = (slots: Slot[]) => slots.map((s) => (s.user_id === userId ? { ...s, is_substitute: !s.is_substitute, is_goalkeeper: false } : s));
    return { A: apply(state.A), B: apply(state.B) };
  },
  fromAssignment(A: string[], B: string[], positions: Record<string, PlayerPosition>, goalkeepers: { A?: string; B?: string }, formatSize: number): LineupState {
    const build = (ids: string[], gk?: string): Slot[] => {
      const ordered = gk ? [gk, ...ids.filter((i) => i !== gk)] : ids;
      return ordered.map((id, i) => ({ user_id: id, position: positions[id] ?? 'ANY', is_goalkeeper: id === gk, is_substitute: i >= formatSize }));
    };
    return { A: build(A, goalkeepers.A), B: build(B, goalkeepers.B) };
  },
};
