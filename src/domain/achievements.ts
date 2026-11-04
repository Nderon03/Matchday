/** Achievement definitions (mirrored in the SQL catalogue, migration 28). */
export interface AchievementInput {
  sessions: number;
  goals: number;
  assists: number;
  motm: number;
  bestWinStreak: number;
  bestUnbeaten: number;
  bestWeekStreak: number;
  maxGoalsInSession: number;
  seasonChampion: boolean;
}

export type AchievementTier = 'common' | 'rare' | 'epic' | 'legendary';
export type AchievementCategory = 'Playing' | 'Scoring' | 'Playmaking' | 'Awards' | 'Form';

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  category: AchievementCategory;
  check: (i: AchievementInput) => boolean;
  progress: (i: AchievementInput) => [number, number];
}

type Numeric = Exclude<keyof AchievementInput, 'seasonChampion'>;

const def = (code: string, name: string, description: string, icon: string, tier: AchievementTier, category: AchievementCategory, field: Numeric, target: number): AchievementDef => ({
  code, name, description, icon, tier, category,
  check: (i) => i[field] >= target,
  progress: (i) => [Math.min(i[field], target), target],
});

export const ACHIEVEMENTS: AchievementDef[] = [
  def('first_match', 'First Match', 'Play your first verified session.', 'shirt', 'common', 'Playing', 'sessions', 1),
  def('apps_10', 'Regular', 'Play 10 verified sessions.', 'people', 'common', 'Playing', 'sessions', 10),
  def('apps_50', '50 Appearances', 'Play 50 verified sessions.', 'medal', 'rare', 'Playing', 'sessions', 50),
  def('apps_100', 'Club Legend', 'Play 100 verified sessions.', 'shield', 'epic', 'Playing', 'sessions', 100),
  def('weeks_5', 'Never Misses', 'Play 5 weeks in a row.', 'calendar', 'common', 'Playing', 'bestWeekStreak', 5),
  def('weeks_20', 'Ever-present', 'Play 20 weeks in a row.', 'flame', 'epic', 'Playing', 'bestWeekStreak', 20),
  def('first_goal', 'First Goal', 'Score your first approved goal.', 'football', 'common', 'Scoring', 'goals', 1),
  def('hat_trick', 'Hat-trick Hero', 'Score 3 or more goals in a single session.', 'flash', 'rare', 'Scoring', 'maxGoalsInSession', 3),
  def('goals_25', 'Goal Machine', 'Score 25 approved goals.', 'locate', 'rare', 'Scoring', 'goals', 25),
  def('goals_100', 'Century', 'Score 100 approved goals.', 'rocket', 'epic', 'Scoring', 'goals', 100),
  def('first_assist', 'First Assist', 'Set up your first approved goal.', 'git-merge', 'common', 'Playmaking', 'assists', 1),
  def('assists_25', 'Playmaker', 'Make 25 approved assists.', 'compass', 'rare', 'Playmaking', 'assists', 25),
  def('first_motm', 'First MOTM', 'Win Man of the Match for the first time.', 'star', 'common', 'Awards', 'motm', 1),
  def('motm_10', '10 MOTM Awards', 'Win Man of the Match 10 times.', 'trophy', 'epic', 'Awards', 'motm', 10),
  {
    code: 'season_champion', name: 'Season Champion', description: 'Be named Player of the Season.', icon: 'ribbon', tier: 'legendary', category: 'Awards',
    check: (i) => i.seasonChampion, progress: (i) => [i.seasonChampion ? 1 : 0, 1],
  },
  def('win_streak_5', 'Five in a Row', 'Win 5 consecutive games.', 'trending-up', 'rare', 'Form', 'bestWinStreak', 5),
  def('unbeaten_10', 'Unbeaten Run', 'Go 10 consecutive games without defeat.', 'shield-checkmark', 'epic', 'Form', 'bestUnbeaten', 10),
];

export const CATEGORIES: AchievementCategory[] = ['Playing', 'Scoring', 'Playmaking', 'Awards', 'Form'];

export const TIERS: Record<AchievementTier, { label: string; colour: string }> = {
  common: { label: 'Common', colour: '#94A3B8' },
  rare: { label: 'Rare', colour: '#38BDF8' },
  epic: { label: 'Epic', colour: '#A78BFA' },
  legendary: { label: 'Legendary', colour: '#F5B014' },
};

export const tierOf = (code: string): AchievementTier => ACHIEVEMENTS.find((a) => a.code === code)?.tier ?? 'common';

/** "6% of players" style rarity; null when there are too few players for it to mean anything. */
export function rarityLabel(holders: number, players: number): string | null {
  if (players < 10) return null;
  const pct = (100 * holders) / players;
  if (pct === 0) return 'No one yet';
  if (pct < 1) return 'Under 1% of players';
  return `${Math.round(pct)}% of players`;
}

/** Codes newly unlocked given what the player already holds (non-repeatable, no duplicates). */
export function newlyUnlocked(input: AchievementInput, alreadyHeld: Iterable<string>): string[] {
  const held = new Set(alreadyHeld);
  return ACHIEVEMENTS.filter((a) => a.check(input) && !held.has(a.code)).map((a) => a.code);
}
