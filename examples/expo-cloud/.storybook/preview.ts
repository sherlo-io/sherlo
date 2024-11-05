import type { Preview } from '@storybook/react';
import { withBackgrounds } from '@storybook/addon-ondevice-backgrounds';

const preview: Preview = {
  decorators: [withBackgrounds],
  parameters: {
    backgrounds: {
      default: 'default',
      values: [
        {
          name: 'default',
          value: '#16171A',
        },
        {
          name: 'white',
          value: '#fff',
        },
      ],
    },
  },
};

export default preview;
