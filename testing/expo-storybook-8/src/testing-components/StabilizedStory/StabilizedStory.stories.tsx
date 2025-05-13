import type { Meta } from '@storybook/react';
import StabilizedStory from './StabilizedStory';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: StabilizedStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof StabilizedStory>;

export const Basic = {};
