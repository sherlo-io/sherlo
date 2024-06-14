import type { Meta } from '@storybook/react';
import TutorialIcon from './TutorialIcon';
import StoryDecorator from '../../../decorators/StoryDecorator';

export default {
  component: TutorialIcon,
  decorators: [StoryDecorator],
} as Meta<typeof TutorialIcon>;

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
