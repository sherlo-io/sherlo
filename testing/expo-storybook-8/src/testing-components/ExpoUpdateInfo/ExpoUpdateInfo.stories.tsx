import { EasUpdateInfo, StoryDecorator } from '@sherlo/testing-components';
import type { Meta } from '@storybook/react';
import * as Updates from 'expo-updates';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: EasUpdateInfo,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof EasUpdateInfo>;

export const Basic = {
  args: {
    update: {
      id: Updates.updateId,
      runtimeVersion: Updates.runtimeVersion,
      createdAt: Updates.createdAt,
    },
  },
};
