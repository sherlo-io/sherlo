import type { Meta } from '@storybook/react';
import UnstableStory from './UnstableStory';
import { StoryDecorator } from '../../decorators';

export default {
  component: UnstableStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof UnstableStory>;

export const Basic = {};
