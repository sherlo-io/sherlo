import type { Meta } from '@storybook/react';
import { ExpoUpdateInfo, StoryDecorator } from '@sherlo/testing-components';
import * as Updates from 'expo-updates';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: ExpoUpdateInfo,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof ExpoUpdateInfo>;

export const Basic = {
  args: {
    update: {
      id: Updates.updateId,
      runtimeVersion: Updates.runtimeVersion,
      createdAt: Updates.createdAt,
    },
  },
};
