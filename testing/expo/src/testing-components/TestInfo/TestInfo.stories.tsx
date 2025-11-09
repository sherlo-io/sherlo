import type { Meta } from '@storybook/react';
import { StoryDecorator, TestInfo } from '@sherlo/testing-components';
import { PixelRatio } from 'react-native';

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
    fontScale: PixelRatio.getFontScale(),
  },
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'fr', countryCode: 'FR' }],
    },
  },
};

export const Polish = {
  args: {
    fontScale: PixelRatio.getFontScale(),
  },
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'pl', countryCode: 'PL' }],
    },
  },
};
