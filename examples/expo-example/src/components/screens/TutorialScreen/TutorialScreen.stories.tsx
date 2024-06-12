import type { Meta, StoryObj } from '@storybook/react';
import { TutorialScreen } from './TutorialScreen';

const meta: Meta<typeof TutorialScreen> = {
  component: TutorialScreen,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Connect: Story = {
  args: {
    variant: 'connect',
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?node-id=2142-2516&t=rfVuFPWQR8pDMNJ3-4',
    },
  },
};

export const SaveEnergy: Story = {
  args: {
    variant: 'saveEnergy',
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?node-id=2142-2515&t=rfVuFPWQR8pDMNJ3-4',
    },
  },
};
