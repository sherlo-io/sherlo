import type {Meta} from '@storybook/react';
import PlaySteps from './PlaySteps';

export default {
  component: PlaySteps,
} as Meta<typeof PlaySteps>;

/** Reaches the chat as a member does: the tab, then the topmost row. */
export const ToTheChat = {
  parameters: {
    sherlo: {
      steps: [{press: 'tab.list'}, {press: 'row'}],
      ready: {testID: 'chat.title', requestsIdle: false},
    },
  },
};

/** The same, the row named by the text it shows. */
export const ToTheChatByName = {
  parameters: {
    sherlo: {
      steps: [{press: 'tab.list'}, {press: {text: 'Bo'}}],
      ready: {testID: 'chat.title', requestsIdle: false},
    },
  },
};

/** A step whose view never shows: the capture must fail naming it. */
export const MissingStep = {
  parameters: {
    sherlo: {
      steps: [{press: 'tab.list'}, {press: 'no.such.row', timeoutMs: 2000}],
    },
  },
};
