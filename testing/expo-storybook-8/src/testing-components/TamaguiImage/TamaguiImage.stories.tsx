import type { Meta } from '@storybook/react';
import TamaguiImage from './TamaguiImage';
import { StoryDecorator } from '@sherlo/testing-components';
import { createTamagui, TamaguiProvider } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';
import { Image } from 'react-native';

export default {
  component: TamaguiImage,
  decorators: [
    StoryDecorator({ placement: 'center' }),
    (Story: any) => {
      const config = createTamagui(defaultConfig);
      return (
        <TamaguiProvider config={config}>
          <Story />
        </TamaguiProvider>
      );
    },
  ],
} as Meta<typeof TamaguiImage>;

export const Url = {
  args: {
    uri: 'https://picsum.photos/id/237/200/300',
  },
};

export const Static = {
  args: {
    uri: require('./static_example.jpg'),
  },
};

const uri = Image.resolveAssetSource(require('./static_example.jpg')).uri;
export const Resolved = {
  args: {
    uri,
  },
};
