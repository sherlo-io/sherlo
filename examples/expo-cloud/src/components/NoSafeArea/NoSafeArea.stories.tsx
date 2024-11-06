import type { Meta } from '@storybook/react';
import NoSafeArea from './NoSafeArea';
import { StoryDecorator } from '@sherlo/testing-components';

export default {
  component: NoSafeArea,
  decorators: [StoryDecorator({ placement: 'center', translucent: true })],
} as Meta<typeof NoSafeArea>;

export const Basic = {
  parameters: {
    noSafeArea: true,
  },
};
