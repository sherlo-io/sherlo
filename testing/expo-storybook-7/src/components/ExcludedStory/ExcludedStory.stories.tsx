import type { Meta } from '@storybook/react';
import ExcludedStory from './ExcludedStory';
import { SherloParameters } from '@sherlo/react-native-storybook';

export default {
  component: ExcludedStory,
} as Meta<typeof ExcludedStory>;

export const Basic = {
  parameters: {
    sherlo: {
      /**
       * Sherlo will not test this story
       */
      exclude: true,
    } as SherloParameters,
  },
};
