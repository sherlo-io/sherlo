import type { Meta } from '@storybook/react';
import AvatarImage from './AvatarImage';
import StoryDecorator from '../../../decorators/StoryDecorator';

export default {
  component: AvatarImage,
  decorators: [StoryDecorator],
} as Meta<typeof AvatarImage>;

export const Basic = {
  args: {
    path: require('../../../../assets/Images/GabeTheDog.jpeg'),
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=1848-1459&mode=design&t=4iEYuDJFeOlEsZak-4',
    },
  },
};
