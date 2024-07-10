import type { Meta } from '@storybook/react';
import SettingsTime from './SettingsTime';
import StoryDecorator from 'decorators/StoryDecorator';

export default {
  component: SettingsTime,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof SettingsTime>;

type Story = {
  args?: Record<string, any>;
};

export const Basic: Story = {};
