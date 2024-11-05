import type { Meta } from '@storybook/react';
import NoSafeArea from './NoSafeArea';

export default {
  component: NoSafeArea,
} as Meta<typeof NoSafeArea>;

export const Basic = {
  parameters: {
    noSafeArea: true,
  },
};
