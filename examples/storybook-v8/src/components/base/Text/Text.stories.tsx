import type { Meta, StoryObj } from '@storybook/react';
import Text from './Text';
import GridDecorator from 'decorators/GridDecorator';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof Text> = {
  component: Text,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'headline',
    children:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vel enim elit. Donec pulvinar aliquet mauris, sit amet sagittis nisl imperdiet nec. ',
  },
  decorators: [StoryDecorator({ placement: 'center' })],
};

const texts = [
  <Text variant="headline">headline</Text>,
  <Text variant="headlineInactive">headlineInactive</Text>,
  <Text variant="subtitle">subtitle</Text>,
  <Text variant="tutorialHeadline">tutorialHeadline</Text>,
  <Text variant="tutorialSubtitle">tutorialSubtitle</Text>,
  <Text variant="tutorialButton">tutorialButton</Text>,
  <Text variant="usernameText">usernameText</Text>,
  <Text variant="displayBox">displayBox</Text>,
  <Text variant="displayBoxValue">displayBoxValue</Text>,
  <Text variant="time">time</Text>,
];

export const Variants: Story = {
  render: () => <GridDecorator items={texts} columns={2.3} />,
};
