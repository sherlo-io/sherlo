import type { Meta, StoryObj } from '@storybook/react';
import Text from './Text';
import StoryDecorator from '../../../decorators/StoryDecorator';
import GridDecorator from 'decorators/GridDecorator';

const meta: Meta<typeof Text> = {
  component: Text,
  decorators: [StoryDecorator],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'headline',
    children:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vel enim elit. Donec pulvinar aliquet mauris, sit amet sagittis nisl imperdiet nec. ',
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};

const texts = [
  <Text variant="headline">Text</Text>,
  <Text variant="headlineInactive">Text</Text>,
  <Text variant="subtitle">Text</Text>,
  <Text variant="tutorialHeadline">Text</Text>,
  <Text variant="tutorialSubtitle">Text</Text>,
  <Text variant="tutorialButton">Text</Text>,
  <Text variant="usernameText">Text</Text>,
  <Text variant="displayBox">Text</Text>,
  <Text variant="displayBoxValue">Text</Text>,
  <Text variant="time">Text</Text>,
];

export const Variants: Story = {
  render: () => <GridDecorator items={texts} columns={2.5} />,

  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};
