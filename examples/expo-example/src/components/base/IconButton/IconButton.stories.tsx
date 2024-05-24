import type { Meta, StoryObj } from '@storybook/react';
import IconButton from './IconButton';
import StoryDecorator from '../../../decorators/StoryDecorator';

const meta: Meta<typeof IconButton> = {
  component: IconButton,
  decorators: [StoryDecorator({ placement: 'center' })],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: 'arrowRight', size: 'big' },
};
