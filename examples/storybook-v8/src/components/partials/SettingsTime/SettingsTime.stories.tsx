import type { Meta } from '@storybook/react';
import SettingsTime from './SettingsTime';

export default {
  component: SettingsTime,
} as Meta<typeof SettingsTime>;

type Story = {
  args?: Record<string, any>;
};

export const Basic: Story = {};
