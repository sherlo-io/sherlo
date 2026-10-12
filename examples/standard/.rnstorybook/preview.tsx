import { useEffect } from 'react';
import type { Preview } from '@storybook/react-native';
import { reportStoryRendered } from '../spike/bundleReload';

// Spike bundle-reload: the first story to mount in a JS context reports it.
function ReportRendered({ children }: { children: React.ReactNode }) {
  useEffect(() => reportStoryRendered(), []);
  return <>{children}</>;
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <ReportRendered>
        <Story />
      </ReportRendered>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
