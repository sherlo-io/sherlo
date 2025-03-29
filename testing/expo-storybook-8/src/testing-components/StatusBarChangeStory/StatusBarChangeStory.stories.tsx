import type { Meta } from '@storybook/react';
import StatusBarChangeStory from './StatusBarChangeStory';
import { StoryDecorator } from '@sherlo/testing-components';

/**
 * This is a test screen that we add to our tests
 * to display information about device and app configuration
 */
export default {
  component: StatusBarChangeStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof StatusBarChangeStory>;

export const BackgroundColorOnlyOnAndroid = {
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

export const DarkContent = {
  args: {
    property: 'darkContent',
  },
};

export const LightContent = {
  args: {
    property: 'lightContent',
  },
};

export const WithoutTranslucentOnlyOnAndroid = {
  args: {
    property: 'withoutTranslucent',
  },
  parameters: {
    sherlo: {
      // setStatusBarTranslucent is only supported on Android
      platform: 'android',
    },
  },
};
