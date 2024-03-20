import type { Meta, StoryObj } from '@storybook/react';
import CardItem from './CardItem';

const meta = {
  component: CardItem,
  parameters: {
    backgrounds: {
      default: 'white',
    },
  },
} satisfies Meta<typeof CardItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TopLights: Story = {
  args: {
    withDimmedHeader: true,
    imageKey: 'topLights',
  },
  decorators: [],
};

export const AirPurifier: Story = {
  args: {
    withDimmedHeader: true,
    imageKey: 'airPurifier',
  },
};

export const VacuumCleaner: Story = {
  args: {
    withDimmedHeader: true,
    imageKey: 'vacuumCleaner',
  },
};

export const BedsideLamp: Story = {
  args: {
    withDimmedHeader: true,
    imageKey: 'bedsideLamp',
  },
};

export const Speaker: Story = {
  args: {
    withDimmedHeader: true,
    imageKey: 'speaker',
  },
};

export const Heating: Story = {
  args: {
    withDimmedHeader: true,
    imageKey: 'heating',
  },
};

export const Livingroom: Story = {
  args: {
    withDimmedHeader: false,
    imageKey: 'livingRoom',
  },
};

export const Bedroom: Story = {
  args: {
    withDimmedHeader: false,
    imageKey: 'bedroom',
  },
};

export const Office: Story = {
  args: {
    withDimmedHeader: false,
    imageKey: 'office',
  },
};

export const Bathroom: Story = {
  args: {
    withDimmedHeader: false,
    imageKey: 'bathroom',
  },
};
