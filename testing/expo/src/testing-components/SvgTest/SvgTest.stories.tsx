import type { Meta, StoryObj } from '@storybook/react';
import { SvgTest } from './SvgTest';

const meta: Meta<typeof SvgTest> = {
  title: 'Testing/SvgTest',
  component: SvgTest,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SvgTest>;

export const Default: Story = {};

