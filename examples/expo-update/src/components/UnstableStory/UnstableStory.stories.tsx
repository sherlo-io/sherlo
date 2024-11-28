import type { Meta } from '@storybook/react';
import UnstableStory from './UnstableStory';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: UnstableStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof UnstableStory>;

export const Basic = {};
