import {StorybookConfig} from '@storybook/react-native';

const main: StorybookConfig = {
  stories: ['../src/components/**/*.stories.?(ts|tsx|js|jsx)'],
  addons: [],
};

export default main;
