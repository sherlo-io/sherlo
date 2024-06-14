import type { Meta, StoryObj } from '@storybook/react';
import { MainScreen } from './MainScreen';

const meta: Meta<typeof MainScreen> = {
  component: MainScreen,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Devices: Story = {
  args: {
    initialActivePage: 0,
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?node-id=2142-2518&t=rfVuFPWQR8pDMNJ3-4',
    },
  },
};

export const Rooms: Story = {
  args: {
    initialActivePage: 1,
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?node-id=2142-2517&t=rfVuFPWQR8pDMNJ3-4',
    },
  },
};
