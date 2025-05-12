import { StoryDecorator } from '@sherlo/testing-components';
import { createTamagui, TamaguiProvider } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';
import TamaguiSheet from './TamaguiSheet';

export default {
  component: TamaguiSheet,
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
};

export const Default = {};
