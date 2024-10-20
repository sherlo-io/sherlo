// .storybook-web/main.ts
import type { StorybookConfig } from '@storybook/react-webpack5';
import path from "path";

type ServerStorybookConfig = StorybookConfig & {
  reactNativeServerOptions: { host: string; port: number };
};

const main: ServerStorybookConfig = {
  stories: ['../src/**/*.stories.?(ts|tsx|js|jsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-react-native-web',
    "@storybook/addon-designs",
    '@storybook/addon-react-native-server',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  

  reactNativeServerOptions: {
    // for android you should use your local ip address here
    host: 'localhost',
    port: 7007,
  },

  docs: {
    autodocs: 'tag',
  },
};

export default main;