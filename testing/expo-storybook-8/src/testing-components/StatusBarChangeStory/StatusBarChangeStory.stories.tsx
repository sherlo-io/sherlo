import type { Meta } from '@storybook/react';
import StatusBarChangeStory from './StatusBarChangeStory';
import { StoryDecorator } from 'decorators';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: StatusBarChangeStory,
  decorators: [StoryDecorator({ placement: 'center' })],
  parameters: {
    noSafeArea: true,
  },
} as Meta<typeof StatusBarChangeStory>;

export const BackgroundColor = {
  args: {
    property: 'backgroundColor',
  },
  parameters: {
    sherlo: {
      // setStatusBarBackgroundColor is only supported on Android
      platform: 'android',
    },
  },
};

export const Hidden = {
  args: {
    property: 'hidden',
  },
};

export const StyleDark = {
  args: {
    property: 'style:dark',
  },
};

export const StyleLight = {
  args: {
    property: 'style:light',
  },
};

export const Translucent = {
  args: {
    property: 'translucent',
  },
  parameters: {
    sherlo: {
      // setStatusBarTranslucent is only supported on Android
      platform: 'android',
    },
  },
};
