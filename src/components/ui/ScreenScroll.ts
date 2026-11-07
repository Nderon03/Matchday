import { createContext, useContext } from 'react';

/** Lets things inside a Screen (like a guided tour) scroll it, e.g. to bring a button into view. */
export interface ScreenScroll { scrollBy: (dy: number) => void }
export const ScreenScrollContext = createContext<ScreenScroll | null>(null);
export const useScreenScroll = () => useContext(ScreenScrollContext);
