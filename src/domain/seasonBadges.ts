/**
 * Season badges (like ranks in a game). Season 1 is Winter 2027; before that is Pre-season.
 * Codes mirror the server (public.give_season_badge): 'pre', or 's<number>_<tier>' e.g. 's1_elite'.
 */
export type SeasonTier = 'champion' | 'elite' | 'contender' | 'regular' | 'squad' | 'preseason';

export interface SeasonTierInfo {
  name: string;
  /** what it takes, for the help text and the picker */
  hint: string;
  colour: string;
  /** the badge's fill, darker than `colour` */
  fill: string;
  icon: 'trophy' | 'star' | 'shield-half' | 'shield' | 'people' | 'flask';
}

export const SEASON_TIERS: Record<SeasonTier, SeasonTierInfo> = {
  champion: { name: 'Champion', hint: 'Player of the Season', colour: '#F5C542', fill: '#4C1D95', icon: 'trophy' },
  elite: { name: 'Elite', hint: 'Top 25% of the race', colour: '#FFD45C', fill: '#3A2A06', icon: 'star' },
  contender: { name: 'Contender', hint: 'Top half of the race', colour: '#E2E8F0', fill: '#334155', icon: 'shield-half' },
  regular: { name: 'Regular', hint: 'Played half the group’s games', colour: '#E39A5B', fill: '#4A2A12', icon: 'shield' },
  squad: { name: 'Squad', hint: 'Played 3 or more games', colour: '#A1A6AE', fill: '#24272C', icon: 'people' },
  preseason: { name: 'Pre-season', hint: 'Played before Season 1 (a tester)', colour: '#5EEAD4', fill: '#0F3B36', icon: 'flask' },
};

/** Season 1 starts here. */
export const SEASON_ONE = '2027-01-01';

/** 0 is Pre-season, 1 is Winter 2027, 2 is Spring 2027... */
export function seasonNumber(day: string | Date): number {
  const d = typeof day === 'string' ? new Date(`${day.slice(0, 10)}T12:00:00Z`) : day;
  const y = d.getUTCFullYear();
  if (y < 2027) return 0;
  return (y - 2027) * 4 + Math.floor(d.getUTCMonth() / 3) + 1;
}

export interface SeasonBadgeInfo { code: string; tier: SeasonTier; number: number; short: string; label: string; info: SeasonTierInfo }

export function parseSeasonBadge(code: string | null | undefined): SeasonBadgeInfo | null {
  if (!code) return null;
  if (code === 'pre') return { code, tier: 'preseason', number: 0, short: 'PRE', label: 'Pre-season', info: SEASON_TIERS.preseason };
  const m = /^s(\d+)_(champion|elite|contender|regular|squad)$/.exec(code);
  if (!m) return null;
  const tier = m[2] as SeasonTier;
  return { code, tier, number: Number(m[1]), short: `S${m[1]}`, label: `S${m[1]} ${SEASON_TIERS[tier].name}`, info: SEASON_TIERS[tier] };
}
