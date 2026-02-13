import StoryDecorator from '../../shared/StoryDecorator';
import type { Meta, StoryObj } from '@storybook/react';
import Reanimated from './Reanimated';
import { useSharedValue } from 'react-native-reanimated';
const meta = {
  component: Reanimated,
  decorators: [StoryDecorator({ placement: 'center' })],
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const progress = useSharedValue(2);
    return <Reanimated progress={progress} total={10} />;
  },
} as Meta<typeof Reanimated>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
