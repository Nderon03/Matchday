/** Achievement definitions (thresholds mirrored in the SQL catalogue). */
export interface AchievementInput {
  sessions: number;
  goals: number;
  motm: number;
  bestWinStreak: number;
  bestUnbeaten: number;
  maxGoalsInSession: number;
  seasonChampion: boolean;
}

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  check: (i: AchievementInput) => boolean;
  progress: (i: AchievementInput) => [number, number];
}

const counter = (field: keyof AchievementInput, target: number) => (i: AchievementInput): [number, number] => [Math.min(Number(i[field]), target), target];

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_match', name: 'First Match', description: 'Play your first verified session.', icon: 'shirt', check: (i) => i.sessions >= 1, progress: counter('sessions', 1) },
  { code: 'first_goal', name: 'First Goal', description: 'Score your first approved goal.', icon: 'football', check: (i) => i.goals >= 1, progress: counter('goals', 1) },
  { code: 'first_motm', name: 'First MOTM', description: 'Win Man of the Match for the first time.', icon: 'star', check: (i) => i.motm >= 1, progress: counter('motm', 1) },
  { code: 'hat_trick', name: 'Hat-trick Hero', description: 'Score 3 or more goals in a single session.', icon: 'flame', check: (i) => i.maxGoalsInSession >= 3, progress: counter('maxGoalsInSession', 3) },
  { code: 'motm_10', name: '10 MOTM Awards', description: 'Win Man of the Match 10 times.', icon: 'trophy', check: (i) => i.motm >= 10, progress: counter('motm', 10) },
  { code: 'apps_50', name: '50 Appearances', description: 'Play 50 verified sessions.', icon: 'medal', check: (i) => i.sessions >= 50, progress: counter('sessions', 50) },
  { code: 'goals_100', name: 'Century', description: 'Score 100 approved goals.', icon: 'rocket', check: (i) => i.goals >= 100, progress: counter('goals', 100) },
  { code: 'win_streak_5', name: 'Five in a Row', description: 'Win 5 consecutive games.', icon: 'trending-up', check: (i) => i.bestWinStreak >= 5, progress: counter('bestWinStreak', 5) },
  { code: 'unbeaten_10', name: 'Unbeaten Run', description: 'Go 10 consecutive games without defeat.', icon: 'shield-checkmark', check: (i) => i.bestUnbeaten >= 10, progress: counter('bestUnbeaten', 10) },
  { code: 'season_champion', name: 'Season Champion', description: 'Be named Player of the Season.', icon: 'ribbon', check: (i) => i.seasonChampion, progress: (i) => [i.seasonChampion ? 1 : 0, 1] },
];

/** Codes newly unlocked given what the player already holds (non-repeatable, no duplicates). */
export function newlyUnlocked(input: AchievementInput, alreadyHeld: Iterable<string>): string[] {
  const held = new Set(alreadyHeld);
  return ACHIEVEMENTS.filter((a) => a.check(input) && !held.has(a.code)).map((a) => a.code);
}
