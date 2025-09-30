import type { Meta } from '@storybook/react';
import KillDeviceStory from './KillDeviceStory';

export default {
  component: KillDeviceStory,
} as Meta;

export const Basic = {
  parameters: {
    sherlo: {
      killDevice: true,
    },
  },
};
