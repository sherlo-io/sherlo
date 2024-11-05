import type { Meta } from '@storybook/react';
import WithFigmaComparison from './WithFigmaComparison';
import { SherloParameters } from '@sherlo/react-native-storybook';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: WithFigmaComparison,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof WithFigmaComparison>;

export const Basic = {
  parameters: {
    sherlo: {
      /**
       * Sherlo will display this figma design next to screenshots of this component
       * to streamline the comparison process.
       *
       * You can get the url by pressing on a frame in Figma
       * -> "Copy / Paste as" -> "Copy link to selection"
       */
      figmaUrl: 'https://www.figma.com/design/...',
      /**
       * This is an alternative to "figmaUrl" that is a standard for @storybook/addon-designs
       * Sherlo also supports this format but will prioritize "figmaUrl"
       */
      design: {
        type: 'figma',
        url: 'https://www.figma.com/design/...',
      },
    } as SherloParameters,
  },
};
