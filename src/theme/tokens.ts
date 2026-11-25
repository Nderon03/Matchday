/** MATCHDAY design tokens. Dark is the primary experience; light mirrors it. */
export const palette = {
  green500: '#22C55E',
  green600: '#16A34A',
  green700: '#15803D',
  amber: '#F5A524',
  red: '#EF4444',
  gold: '#E8B931',
  silver: '#C3CAD4',
  bronze: '#CD8A4B',
  white: '#FFFFFF',
};

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  elevated: string;
  border: string;
  borderStrong: string;
  /** a card's top edge, a touch lighter: surfaces look lit from above (depth without extra size) */
  borderTop: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryPressed: string;
  primaryMuted: string;
  onPrimary: string;
  success: string;
  warning: string;
  warningMuted: string;
  /** soft edges and washes for emphasised cards: calmer than full-strength outlines */
  primaryBorder: string;
  primarySurface: string;
  warningBorder: string;
  warningSurface: string;
  dangerBorder: string;
  dangerSurface: string;
  danger: string;
  dangerMuted: string;
  gold: string;
  silver: string;
  bronze: string;
  pitch: string;
  pitchStripe: string;
  pitchLine: string;
  overlay: string;
  teamA: string;
  teamB: string;
}

export const dark: ThemeColors = {
  bg: '#08090C',
  surface: '#111418',
  surfaceAlt: '#171B21',
  elevated: '#1D2229',
  border: 'rgba(255,255,255,0.075)',
  borderStrong: 'rgba(255,255,255,0.14)',
  borderTop: 'rgba(255,255,255,0.12)',
  text: '#F2F4F7',
  textMuted: '#98A2B3',
  textFaint: '#828A9B', // ≥4.5:1 on every dark surface (WCAG AA)
  primary: palette.green500,
  primaryPressed: palette.green600,
  primaryMuted: 'rgba(34,197,94,0.14)',
  onPrimary: '#05210F',
  success: palette.green500,
  warning: palette.amber,
  warningMuted: 'rgba(245,165,36,0.14)',
  primaryBorder: 'rgba(34,197,94,0.36)',
  primarySurface: '#0F1A14',
  warningBorder: 'rgba(245,165,36,0.34)',
  warningSurface: '#1A160E',
  dangerBorder: 'rgba(239,68,68,0.36)',
  dangerSurface: '#1B1012',
  danger: palette.red,
  dangerMuted: 'rgba(239,68,68,0.14)',
  gold: palette.gold,
  silver: palette.silver,
  bronze: palette.bronze,
  pitch: '#0E3B24',
  pitchStripe: '#114429',
  pitchLine: 'rgba(255,255,255,0.28)',
  overlay: 'rgba(0,0,0,0.6)',
  teamA: palette.green500,
  teamB: '#E8ECF1',
};

export const light: ThemeColors = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2F5',
  elevated: '#FFFFFF',
  border: 'rgba(16,24,40,0.09)',
  borderStrong: 'rgba(16,24,40,0.17)',
  borderTop: 'rgba(16,24,40,0.06)',
  text: '#0B0F14',
  textMuted: '#556070',
  textFaint: '#656C77', // ≥4.5:1 on every light surface
  primary: '#117E39', // green text and white-on-green buttons both ≥4.5:1 on light
  primaryPressed: '#0E6B30',
  primaryMuted: 'rgba(22,163,74,0.12)',
  onPrimary: '#FFFFFF',
  success: '#117E39',
  warning: '#A55A05',
  warningMuted: 'rgba(217,119,6,0.12)',
  primaryBorder: 'rgba(22,163,74,0.38)',
  primarySurface: '#F3FBF6',
  warningBorder: 'rgba(217,119,6,0.36)',
  warningSurface: '#FFF9F0',
  dangerBorder: 'rgba(220,38,38,0.34)',
  dangerSurface: '#FFF5F5',
  danger: '#D32424',
  dangerMuted: 'rgba(220,38,38,0.1)',
  gold: '#856A14',
  silver: '#676D75',
  bronze: '#995F2A',
  pitch: '#1F7A45',
  pitchStripe: '#23854C',
  pitchLine: 'rgba(255,255,255,0.55)',
  overlay: 'rgba(10,12,15,0.45)',
  teamA: palette.green600,
  teamB: '#1F2933',
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 7, md: 10, lg: 14, xl: 18, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
  // the scoreboard face: scores, ratings, countdowns and big numbers, like TV football graphics
  score: 'BarlowCondensed_700Bold',
  scoreHeavy: 'BarlowCondensed_800ExtraBold',
};

export const type = {
  display: { fontFamily: fonts.scoreHeavy, fontSize: 40, lineHeight: 44, letterSpacing: 0 },
  h1: { fontFamily: fonts.bold, fontSize: 25, lineHeight: 30, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, letterSpacing: -0.35 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  stat: { fontFamily: fonts.scoreHeavy, fontSize: 32, lineHeight: 36, letterSpacing: 0.2, fontVariant: ['tabular-nums' as const] },
  statSmall: { fontFamily: fonts.score, fontSize: 21, lineHeight: 24, letterSpacing: 0.2, fontVariant: ['tabular-nums' as const] },
};

export type TypeVariant = keyof typeof type;

/** Soft shadows for things that float (sheets, toasts, menus). Cards stay flat: depth comes from the lit top edge. */
export const shadow = {
  float: { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  raise: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
} as const;
