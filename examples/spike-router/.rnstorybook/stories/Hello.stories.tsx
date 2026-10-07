import type { Meta, StoryObj } from '@storybook/react-native';
import { Text } from 'react-native';

console.log('SPIKE_MARKER_STORY_EVALUATED');

const meta = {
  title: 'Spike/Hello',
  component: Text,
} satisfies Meta<typeof Text>;

export default meta;

export const Basic: StoryObj<typeof meta> = { args: { children: 'SPIKE_STORY_SCREEN' } };
