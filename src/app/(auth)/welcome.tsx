import React from 'react';
import { Platform } from 'react-native';
import { Screen } from '@/components/ui';
import { IntroCarousel } from '@/features/intro/IntroCarousel';
import { Landing } from '@/features/Landing';

/** On the website this is the homepage; in the app it's the intro carousel. */
export default function Welcome() {
  if (Platform.OS === 'web') return <Landing />;
  return (
    <Screen edges={['top', 'bottom']} maxWidth={520} scroll={false}>
      <IntroCarousel />
    </Screen>
  );
}
