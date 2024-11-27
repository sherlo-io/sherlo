import { StoryDecorator } from '@sherlo/testing-components';
import type { Meta } from '@storybook/react';
import FocusedInput from './FocusedInput';

export default {
  component: FocusedInput,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof FocusedInput>;

export const Basic = {
  parameters: {
    sherlo: {
      /**
       * This will prevent the input from being focused and displaying
       * the caret blinking which would cause differences in Sherlo screenshot tests
       */
      defocus: true,
    },
  },
};

export const Focused = {};
