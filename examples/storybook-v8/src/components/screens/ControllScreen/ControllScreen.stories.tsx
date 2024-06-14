import { Meta, StoryObj } from '@storybook/react';
import { ControlScreen } from './ControlScreen';

const meta: Meta<typeof ControlScreen> = {
  component: ControlScreen,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Heating: Story = {
  args: {
    deviceName: 'Heating',
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?node-id=2142-2511&t=rfVuFPWQR8pDMNJ3-4',
    },
  },
};

export const AirPurifier: Story = {
  args: {
    deviceName: 'Air Purifier',
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?node-id=2142-2514&t=rfVuFPWQR8pDMNJ3-4',
    },
  },
};
