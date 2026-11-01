import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, isDesktop: width >= 1024, isTablet: width >= 700 && width < 1024, isWide: width >= 700, isSmall: width < 360 };
}
