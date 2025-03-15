import type { Meta } from '@storybook/react';
import NoSafeArea from './NoSafeArea';
import { StoryDecorator } from '../../decorators';

export default {
  component: NoSafeArea,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof NoSafeArea>;

export const Basic = {
  parameters: {
    noSafeArea: true,
  },
};
