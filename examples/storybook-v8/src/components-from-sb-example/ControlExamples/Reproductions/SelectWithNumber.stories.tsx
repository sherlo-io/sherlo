import { Meta, StoryObj } from '@storybook/react';

import { MyButton } from './SelectWithNumber';

export default {
  title: 'ControlExamples/SelectWithNumber',
  component: MyButton,
} as Meta<typeof MyButton>;

export const Basic: StoryObj<typeof MyButton> = {
  args: {},
};
