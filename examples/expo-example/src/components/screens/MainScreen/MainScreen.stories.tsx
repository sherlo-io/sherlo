import type { Meta } from '@storybook/react';
import { MainScreen } from './MainScreen';

export default {
  component: MainScreen,
} as Meta<typeof MainScreen>;

type Story = {
  args?: Record<string, any>;
};

export const Basic: Story = {};
