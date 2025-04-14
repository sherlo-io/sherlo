import type { Meta } from '@storybook/react';
import { StoryDecorator, TestInfo } from '@sherlo/testing-components';
import * as Localization from 'expo-localization';

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
  },
};
