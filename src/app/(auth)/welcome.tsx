import React from 'react';
import { Screen } from '@/components/ui';
import { IntroCarousel } from '@/features/intro/IntroCarousel';

export default function Welcome() {
  return (
    <Screen edges={['top', 'bottom']} maxWidth={520} scroll={false}>
      <IntroCarousel />
    </Screen>
  );
}
