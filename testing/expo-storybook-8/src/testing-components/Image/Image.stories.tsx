import type { Meta } from '@storybook/react';
import { Image } from 'react-native';
import { StoryDecorator } from '@sherlo/testing-components';
import { Image as TamaguiImage } from '@tamagui/image';
import { Image as ExpoImage } from 'expo-image';
import FastImage from '@d11/react-native-fast-image';
import TurboImage from 'react-native-turbo-image';

import { createTamagui, TamaguiProvider } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';

export default {
  component: Image,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof Image>;

// 1. HTTP(S) URL
export const Url = {
  args: {
    source: {
      uri: 'https://picsum.photos/id/237/200/300',
    },
    style: { width: 200, height: 300 },
  },
};

// 2. Static require (bundled asset)
export const Static = {
  args: {
    source: require('./static_example.jpg'),
    style: { width: 200, height: 300 },
  },
};

// 3. Resolved static asset
export const Resolved = {
  args: {
    source: {
      uri: Image.resolveAssetSource(require('./static_example.jpg')).uri,
    },
    style: { width: 200, height: 300 },
  },
};

export const Tamagui = {
  render: () => {
    const config = createTamagui(defaultConfig);
    return (
      <TamaguiProvider config={config}>
        <TamaguiImage
          source={{
            uri: 'https://picsum.photos/id/237/200/300',
            width: 200,
            height: 300,
          }}
        />
      </TamaguiProvider>
    );
  },
};

export const Expo = {
  render: () => {
    return (
      <ExpoImage
        source="https://picsum.photos/id/237/200/300"
        style={{ width: 200, height: 300 }}
      />
    );
  },
};

export const Fast = {
  render: () => {
    return (
      <FastImage
        source={{ uri: 'https://picsum.photos/id/237/200/300' }}
        style={{ width: 200, height: 300 }}
        resizeMode={FastImage.resizeMode.cover}
      />
    );
  },
};

export const Turbo = {
  render: () => (
    <TurboImage
      source={{ uri: 'https://picsum.photos/id/237/200/300' }}
      style={{ width: 200, height: 300 }}
    />
  ),
};
