/**
 * Player card titles: a short line under your name. A few are free; the rest unlock with medals,
 * Player of the Season, perfect reliability or medal points. The same rules are checked on the
 * server (public.card_title_requirement), so keep the two lists in step.
 */
export type TitleRequirement =
  | { kind: 'free' }
  | { kind: 'medal'; code: string }
  | { kind: 'points'; points: number }
  | { kind: 'reliable' };

export interface CardTitle { id: string; label: string; hint: string; req: TitleRequirement }

const medal = (code: string) => ({ kind: 'medal', code }) as const;

export const CARD_TITLES: CardTitle[] = [
  // free from day one
  { id: 'weekend_warrior', label: 'Weekend Warrior', hint: 'Free', req: { kind: 'free' } },
  { id: 'sunday_leaguer', label: 'Sunday Leaguer', hint: 'Free', req: { kind: 'free' } },
  { id: 'bib_collector', label: 'Bib Collector', hint: 'Free', req: { kind: 'free' } },
  { id: 'astro_turfer', label: 'Astro Turfer', hint: 'Free', req: { kind: 'free' } },
  { id: 'jumpers_for_goalposts', label: 'Jumpers for Goalposts', hint: 'Free', req: { kind: 'free' } },
  { id: 'tekkers_trainee', label: 'Tekkers Trainee', hint: 'Free', req: { kind: 'free' } },
  // appearances
  { id: 'fresh_boots', label: 'Fresh Boots', hint: 'Play your first game', req: medal('apps_l1') },
  { id: 'club_regular', label: 'Club Regular', hint: 'Play 25 games', req: medal('apps_l3') },
  { id: 'centurion', label: 'Centurion', hint: 'Play 100 games', req: medal('apps_l5') },
  // goals
  { id: 'off_the_mark', label: 'Off the Mark', hint: 'Score your first goal', req: medal('goals_l1') },
  { id: 'poacher', label: 'Poacher', hint: 'Score 25 goals', req: medal('goals_l3') },
  { id: 'goal_machine', label: 'Goal Machine', hint: 'Score 100 goals', req: medal('goals_l5') },
  { id: 'brace_yourself', label: 'Brace Yourself', hint: 'Score 2 in a game', req: medal('haul_l1') },
  { id: 'hat_trick_hero', label: 'Hat-trick Hero', hint: 'Score 3 in a game', req: medal('haul_l2') },
  // assists
  { id: 'provider', label: 'The Provider', hint: '10 assists', req: medal('assists_l2') },
  { id: 'architect', label: 'The Architect', hint: '50 assists', req: medal('assists_l4') },
  // man of the match
  { id: 'man_of_the_moment', label: 'Man of the Moment', hint: 'Win Man of the Match', req: medal('motm_l1') },
  { id: 'baller', label: 'Baller', hint: 'Win MOTM 10 times', req: medal('motm_l3') },
  { id: 'main_character', label: 'Main Character', hint: 'Win MOTM 50 times', req: medal('motm_l5') },
  // streaks
  { id: 'ever_present', label: 'Ever Present', hint: 'Play 5 weeks in a row', req: medal('weeks_l2') },
  { id: 'serial_winner', label: 'Serial Winner', hint: 'Win 7 in a row', req: medal('wins_l3') },
  { id: 'brick_wall', label: 'Brick Wall', hint: '15 games unbeaten', req: medal('unbeaten_l3') },
  // the big ones
  { id: 'always_turns_up', label: 'Always Turns Up', hint: '100% reliable over 10+ games', req: { kind: 'reliable' } },
  { id: 'player_of_the_season', label: 'Player of the Season', hint: 'Win Player of the Season', req: medal('season_champion') },
  { id: 'elite', label: 'Elite', hint: 'Reach 26 medal points', req: { kind: 'points', points: 26 } },
  { id: 'legend', label: 'Legend', hint: 'Reach Hall of Fame (40 medal points)', req: { kind: 'points', points: 40 } },
];

export const cardTitle = (id?: string | null) => CARD_TITLES.find((t) => t.id === id) ?? null;

/** Whether a title is unlocked, from the player's medal codes, medal points and reliability. */
export function titleUnlocked(t: CardTitle, have: { codes: Set<string>; points: number; perfectlyReliable: boolean }) {
  switch (t.req.kind) {
    case 'free': return true;
    case 'medal': return have.codes.has(t.req.code);
    case 'points': return have.points >= t.req.points;
    case 'reliable': return have.perfectlyReliable;
  }
}
