import StoryDecorator from '../../shared/StoryDecorator';
import type { Meta } from '@storybook/react';
import Stabilized from './Stabilized';

export default {
  component: Stabilized,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof Stabilized>;

export const Basic = {};
