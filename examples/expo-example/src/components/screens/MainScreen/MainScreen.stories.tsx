import type { Meta, StoryObj } from '@storybook/react';
import { MainScreen } from './MainScreen';

const meta: Meta<typeof MainScreen> = {
  component: MainScreen,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
