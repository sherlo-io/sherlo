import type { Meta } from '@storybook/react';
import GradientStory from './GradientStory';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: GradientStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof GradientStory>;

export const ExpoLinearGradient = {
  args: {
    library: 'expo-linear-gradient',
  },
};
export const ReactNativeLinearGradient = {
  args: {
    library: 'react-native-linear-gradient',
  },
};
