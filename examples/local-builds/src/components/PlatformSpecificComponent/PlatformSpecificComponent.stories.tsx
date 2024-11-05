import type { Meta } from '@storybook/react';
import PlatformSpecificComponent from './PlatformSpecificComponent';
import { SherloParameters } from '@sherlo/react-native-storybook';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: PlatformSpecificComponent,
  decorators: [StoryDecorator({ placement: 'center' })],
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
