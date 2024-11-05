import type { Meta } from '@storybook/react';
import PlatformSpecificComponent from './PlatformSpecificComponent';
import { SherloParameters } from '@sherlo/react-native-storybook';

export default {
  component: PlatformSpecificComponent,
} as Meta<typeof PlatformSpecificComponent>;

export const Basic = {
  parameters: {
    sherlo: {
      /**
       * Sherlo will only test this story on iOS
       */
      platform: 'ios',
    } as SherloParameters,
  },
};
