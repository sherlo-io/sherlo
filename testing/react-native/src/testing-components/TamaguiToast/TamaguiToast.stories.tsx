import type { Meta } from '@storybook/react';
import TamaguiToast from './TamaguiToast';
import StoryDecorator from '../../shared/StoryDecorator';
import { createTamagui, TamaguiProvider } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';
import { ToastProvider, ToastViewport } from '@tamagui/toast';

export default {
  component: TamaguiToast,
  decorators: [
    StoryDecorator({ placement: 'center' }),
    (Story: any) => {
      const config = createTamagui(defaultConfig);
      return (
        <TamaguiProvider config={config}>
          <ToastProvider>
            <Story />
            <ToastViewport />
          </ToastProvider>
        </TamaguiProvider>
      );
    },
  ],
} as Meta<typeof TamaguiToast>;

export const Basic = {};
