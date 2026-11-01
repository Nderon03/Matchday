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
  bg: '#0A0C0F',
  surface: '#12161B',
  surfaceAlt: '#181D24',
  elevated: '#1E242C',
  border: '#232A33',
  borderStrong: '#323B47',
  text: '#F4F6F8',
  textMuted: '#97A1AE',
  textFaint: '#5F6976',
  primary: palette.green500,
  primaryPressed: palette.green600,
  primaryMuted: 'rgba(34,197,94,0.14)',
  onPrimary: '#05210F',
  success: palette.green500,
  warning: palette.amber,
  warningMuted: 'rgba(245,165,36,0.14)',
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
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F4',
  elevated: '#FFFFFF',
  border: '#E1E6EB',
  borderStrong: '#CBD2DA',
  text: '#0B0F14',
  textMuted: '#5A6472',
  textFaint: '#8C96A3',
  primary: palette.green600,
  primaryPressed: palette.green700,
  primaryMuted: 'rgba(22,163,74,0.12)',
  onPrimary: '#FFFFFF',
  success: palette.green600,
  warning: '#D97706',
  warningMuted: 'rgba(217,119,6,0.12)',
  danger: '#DC2626',
  dangerMuted: 'rgba(220,38,38,0.1)',
  gold: '#C9A01E',
  silver: '#9AA3AF',
  bronze: '#B87333',
  pitch: '#1F7A45',
  pitchStripe: '#23854C',
  pitchLine: 'rgba(255,255,255,0.55)',
  overlay: 'rgba(10,12,15,0.45)',
  teamA: palette.green600,
  teamB: '#1F2933',
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
};

export const type = {
  display: { fontFamily: fonts.heavy, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  stat: { fontFamily: fonts.heavy, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, fontVariant: ['tabular-nums' as const] },
  statSmall: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums' as const] },
};

export type TypeVariant = keyof typeof type;
