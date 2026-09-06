import React from 'react';
import type { Preview } from '@storybook/react';

/**
 * Logged by every story render so a device test has one deterministic signal
 * that a story reached the screen, whichever story Storybook opens to. The
 * same literal is in `testing/device-tests/src/sanityDevMode.test.ts` - a
 * release bundle cannot import from that suite, so keep the two equal.
 */
const STORY_RENDERED_MARKER = '[SHERLO_STORY_RENDERED]';

const preview: Preview = {
  decorators: [
    (Story) => {
      console.log(STORY_RENDERED_MARKER);
      return React.createElement(Story);
    },
  ],
};

export default preview;
