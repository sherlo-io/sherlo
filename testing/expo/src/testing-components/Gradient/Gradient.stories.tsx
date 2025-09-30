import { StoryDecorator } from '@sherlo/testing-components';
import type { Meta } from '@storybook/react';
import Gradient from './Gradient';

export default {
  component: Gradient,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof Gradient>;

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
