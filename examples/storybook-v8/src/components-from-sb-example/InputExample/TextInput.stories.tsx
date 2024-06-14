import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './TextInput';

const meta = {
  title: 'TextInput',
  component: Input,
  parameters: {
    notes: 'Use this example to test the software keyboard related issues.',
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    placeholder: 'Type something',
  },
};
