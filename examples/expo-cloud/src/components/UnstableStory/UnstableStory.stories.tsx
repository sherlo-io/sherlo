import type { Meta } from '@storybook/react';
import UnstableStory from './UnstableStory';
import { SherloParameters } from '@sherlo/react-native-storybook';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: UnstableStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof UnstableStory>;

export const Basic = {};
