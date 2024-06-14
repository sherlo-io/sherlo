import type { Meta, StoryObj } from '@storybook/react';
import Footer from './Footer';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof Footer> = {
  component: Footer,
  decorators: [StoryDecorator({ placement: 'bottom' })],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
