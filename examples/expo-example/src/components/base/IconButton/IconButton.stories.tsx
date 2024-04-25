import type { Meta, StoryObj } from '@storybook/react';
import IconButton from './IconButton';
import StoryDecorator from '../../../decorators/StoryDecorator';

const meta: Meta<typeof IconButton> = {
  component: IconButton,
  decorators: [StoryDecorator],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: 'arrowRight', size: 'big' },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};
