import { useCallback } from 'react';
import { useTheme } from './ThemeProvider';
import { readableOn } from './contrast';

/** `readable(colour, bg?)`: on the light theme, the colour darkened to read on `bg` (default: card surface); unchanged on dark. */
export function useReadable() {
  const { scheme, colors } = useTheme();
  return useCallback(
    (colour: string, bg: string = colors.surface) => (scheme === 'light' ? readableOn(colour, bg, 4.6) : colour),
    [scheme, colors.surface],
  );
}
