import type { Meta } from '@storybook/react';
import * as Localization from 'expo-localization';
import { PixelRatio } from 'react-native';
import StoryDecorator from '../../shared/StoryDecorator';
import TestInfo from '../../shared/TestInfo';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: TestInfo,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof TestInfo>;

export const Basic = {
  args: {
    locale: Localization.locale,
    fontScale: PixelRatio.getFontScale(),
  },
};
