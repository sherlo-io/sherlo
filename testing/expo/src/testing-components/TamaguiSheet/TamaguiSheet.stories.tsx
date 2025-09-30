import { StoryDecorator } from '@sherlo/testing-components';
import { createTamagui, TamaguiProvider } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';
import TamaguiSheet from './TamaguiSheet';
import type { Meta, StoryObj } from '@storybook/react';

type Story = StoryObj<typeof TamaguiSheet>;

const meta: Meta<typeof TamaguiSheet> = {
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
  args: {
    open: true,
    onOpenChange: () => {},
  },
};

export default meta;

export const Default: Story = {};

export const InlineType: Story = {
  args: {
    type: 'inline',
  },
};

export const ConstantMode: Story = {
  args: {
    mode: 'constant',
  },
};

export const FitMode: Story = {
  args: {
    mode: 'fit',
  },
};

export const MixedMode: Story = {
  args: {
    mode: 'mixed',
  },
};

export const MixedFitDemo: Story = {
  args: {
    mode: 'mixed',
    mixedFitDemo: true,
  },
};

export const ModalWithConstantMode: Story = {
  args: {
    type: 'modal',
    mode: 'constant',
  },
};

export const Native: Story = {
  args: {
    native: true,
  },
};
