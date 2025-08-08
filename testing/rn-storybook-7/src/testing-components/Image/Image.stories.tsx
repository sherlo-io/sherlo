import React from 'react';
import type {Meta} from '@storybook/react';
import {Image} from 'react-native';
import {StoryDecorator} from '@sherlo/testing-components';
import {Image as TamaguiImage} from '@tamagui/image';
import TurboImage from 'react-native-turbo-image';

import {createTamagui, TamaguiProvider} from 'tamagui';
import {defaultConfig} from '@tamagui/config/v4';

export default {
  component: Image,
  decorators: [StoryDecorator({placement: 'center'})],
} as Meta<typeof Image>;

const URL = 'https://picsum.photos/id/237/200/300';

export const RNUrl = {
  args: {
    source: {
      uri: URL,
    },
    style: {width: 200, height: 300},
  },
};

export const RNStatic = {
  args: {
    source: require('./static_example.jpg'),
    style: {width: 200, height: 300},
  },
};

export const RNResolved = {
  args: {
    source: {
      uri: Image.resolveAssetSource(require('./static_example.jpg')).uri,
    },
    style: {width: 200, height: 300},
  },
};

export const TamaguiUrl = {
  render: () => {
    const config = createTamagui(defaultConfig);
    return (
      <TamaguiProvider config={config}>
        <TamaguiImage
          source={{
            uri: URL,
            width: 200,
            height: 300,
          }}
        />
      </TamaguiProvider>
    );
  },
};

export const TurboUrl = {
  render: () => (
    <TurboImage source={{uri: URL}} style={{width: 200, height: 300}} />
  ),
};
