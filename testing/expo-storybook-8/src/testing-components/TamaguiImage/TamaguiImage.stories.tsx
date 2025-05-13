import type { Meta } from '@storybook/react';
import TamaguiImage from './TamaguiImage';
import { StoryDecorator } from '@sherlo/testing-components';
import { createTamagui, TamaguiProvider } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';

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
    variant: 'url',
  },
};

export const Static = {
  args: {
    variant: 'static',
  },
};
