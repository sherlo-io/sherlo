import type { Meta } from '@storybook/react';
import Test from './Test';
import StoryDecorator from '../../decorators/StoryDecorator';

export default {
  component: Test,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof Test>;

export const Basic = {};

export const Secondary = { args: { variant: 'secondary' } };
