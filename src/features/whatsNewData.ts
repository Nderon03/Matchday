/** icon: an Ionicons name (must be in the app's icon set; a unit test checks) */
export type WhatsNewItem = { icon: string; title: string; body: string; route?: string };
/**
 * Release notes shown once after an update. Add a new entry at the TOP for each release with
 * something worth telling players about (the newest is the one shown). `date` is the release day:
 * accounts made after it never see it (they get the welcome tour instead).
 */
export const RELEASES: { id: string; date: string; items: WhatsNewItem[] }[] = [
  {
    id: '2026-11-linkups',
    date: '2026-11-25',
    items: [
      { icon: 'people', title: 'Link-ups', body: 'See who you win most with, and how much better you do together. On your profile under Link-ups & rivals.', route: '/linkups' },
      { icon: 'trophy', title: 'Best duos', body: 'Every group’s Tables tab now shows the pairs who win most when they’re on the same team.' },
      { icon: 'sparkles', title: 'Card makeover', body: 'A cleaner Platinum card, and Gold and Hall of Fame now have their own animations.', route: '/profile' },
      { icon: 'color-palette', title: 'A fresh look', body: 'Calmer colours, tidier buttons and more on screen at once, everywhere in the app.' },
    ],
  },
];

export const whatsNewKey = (release: string, uid: string) => `matchday.whatsNew.${release}.${uid}`;

/** Should this person see the newest release notes? Only once, only if they used the app before it. */
export function isWhatsNewDue(release: { date: string }, profileCreatedAt: string | null | undefined, seen: string | null, toured: string | null) {
  if (seen || !toured) return false;
  const created = profileCreatedAt ? new Date(profileCreatedAt).getTime() : NaN;
  return Number.isFinite(created) && created < new Date(`${release.date}T00:00:00Z`).getTime();
}

