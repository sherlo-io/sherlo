// .storybook-web/preview.tsx
import type { Preview } from "@storybook/react";

const preview: Preview = {
  decorators: [],
  parameters: {
    deviceOnly: true ,
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};
export default preview;
