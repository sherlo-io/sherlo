import { ExpoUpdateInfo, StoryDecorator } from '@sherlo/testing-components';
import type { Meta } from '@storybook/react';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: ExpoUpdateInfo,
  decorators: [StoryDecorator({ placement: 'center' })],
  parameters: {
    noSafeArea: true,
  },
} as Meta<typeof ExpoUpdateInfo>;

export const Basic = {};
