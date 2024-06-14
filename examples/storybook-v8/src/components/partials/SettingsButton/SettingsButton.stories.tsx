import type { Meta } from '@storybook/react';
import SettingsButton from './SettingsButton';

export default {
  component: SettingsButton,
} as Meta<typeof SettingsButton>;

type Story = {
  args?: Record<string, any>;
};

export const Basic: Story = {};
