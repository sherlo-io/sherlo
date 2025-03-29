import { StoryDecorator } from '@sherlo/testing-components';
import type { Meta } from '@storybook/react';
import FocusedInput from './FocusedInput';

export default {
  component: FocusedInput,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof FocusedInput>;

export const Basic = {};
