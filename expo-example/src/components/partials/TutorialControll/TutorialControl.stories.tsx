import type { Meta } from '@storybook/react';
import TutorialControl from './TutorialControl';
import StoryDecorator from '../../../decorators/StoryDecorator';

export default {
  component: TutorialControl,
  decorators: [StoryDecorator],
} as Meta<typeof TutorialControl>;

type Story = {
  args: {
    appState: string;
  };
};

export const TutorialStage1: Story = {
  args: {
    appState: 'tutorial1',
  },
};

export const TutorialStage2: Story = {
  args: {
    appState: 'tutorial2',
  },
};
