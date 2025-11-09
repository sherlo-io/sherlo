import type { Meta } from '@storybook/react';
import { StoryDecorator, MultipleNamedExportsTest } from '@sherlo/testing-components';

export default {
  component: MultipleNamedExportsTest,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof MultipleNamedExportsTest>;

export const MockedMultipleExports = {
  args: {},
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'de', regionCode: 'DE' }],
      // Test that we can mock multiple exports even if component doesn't use all
      // This verifies the extraction and generation handles multiple exports correctly
      locale: 'de-DE',
      locales: ['de-DE', 'en-US'],
    },
  },
};

export const AnotherMockedMultipleExports = {
  args: {},
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'ja', regionCode: 'JP' }],
      locale: 'ja-JP',
      locales: ['ja-JP', 'en-US'],
    },
  },
};

