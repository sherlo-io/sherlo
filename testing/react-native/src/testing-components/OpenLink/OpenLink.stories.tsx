import type { Meta } from '@storybook/react';
import OpenLink from './OpenLink';

export default {
  component: OpenLink,
} as Meta<typeof OpenLink>;

/** Reaches the chat by pressing: the tab, then the topmost row. */
export const PressToTheChat = {
  parameters: {
    sherlo: {
      steps: [{ press: 'tab.list' }, { press: 'row' }],
      ready: { testID: 'chat.title', requestsIdle: false },
    },
  },
};

/** Reaches the same chat by opening the app's own link. */
export const OpenTheChat = {
  parameters: {
    sherlo: {
      steps: [{ open: 'sherloplay://chat/Ada' }],
      ready: { testID: 'chat.title', requestsIdle: false },
    },
  },
};

/** A link the app registers but its navigation does not route: the ready step never is met. */
export const OpenUnroutedLink = {
  parameters: {
    sherlo: {
      steps: [
        { open: 'sherloplay://nowhere' },
        { ready: { testID: 'chat.title', requestsIdle: false, timeoutMs: 2000 } },
      ],
    },
  },
};

/** A link no app on the device takes: the step itself fails. */
export const OpenForeignLink = {
  parameters: {
    sherlo: {
      steps: [{ open: 'nobodyshere://chat/Ada' }],
    },
  },
};
