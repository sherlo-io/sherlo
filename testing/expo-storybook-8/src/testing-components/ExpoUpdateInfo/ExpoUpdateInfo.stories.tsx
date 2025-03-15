import type { Meta } from '@storybook/react';
import { StoryDecorator } from '../../decorators';
import ExpoUpdateInfo from './ExpoUpdateInfo';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: ExpoUpdateInfo,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof ExpoUpdateInfo>;

export const Basic = {};
