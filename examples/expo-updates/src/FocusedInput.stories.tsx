import { TestScreen } from '@sherlo/testing-components';
import type { Meta } from '@storybook/react';

export default {
  component: TestScreen,
} as Meta<typeof TestScreen>;

export const Basic = {
  parameters: {
    sherlo: {
      // This will prevent the input from being focused and displaying
      // the caret blinking which would cause differences in Sherlo screenshot tests
      defocus: true,
    },
  },
};
