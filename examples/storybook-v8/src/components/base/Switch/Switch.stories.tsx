import type { Meta, StoryObj } from '@storybook/react';
import Switch from './Switch';
import StoryDecorator from '../../../decorators/StoryDecorator';
import { useState } from 'react';

const meta: Meta<typeof Switch> = {
  component: Switch,
  decorators: [StoryDecorator({ placement: 'center' })],
};

export default meta;

type Story = StoryObj<typeof meta>;

interface SwitchWithStateProps {
  startstate: boolean;
}

const SwitchWithState = ({ startstate }: SwitchWithStateProps) => {
  const [switchState, setSwitchState] = useState(startstate);
  return <Switch state={switchState} setState={setSwitchState} />;
};

export const active: Story = {
  render: () => <SwitchWithState startstate={true} />,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-27&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};
export const inactive: Story = {
  render: () => <SwitchWithState startstate={false} />,
};
