import React from 'react';
import type {Meta} from '@storybook/react';
import {mock, mockClock} from '@sherlo/react-native-storybook';
import SceneApp, {Plain as PlainScreen} from './SceneApp';

export default {
  component: SceneApp,
} as Meta<typeof SceneApp>;

/** A plain story: the same file, nothing of a scene's. */
export const Plain = {
  render: () => <PlainScreen />,
};

/** A scene: a mocked member and clock, two presses to the chat, ready on the chat's title. */
export const ChatScene = {
  parameters: {
    sherlo: {
      mocks: [
        mock(() => import('./member'), {memberName: () => 'Mocked Mia'}),
        mockClock('2020-01-02T03:04:05.000Z'),
      ],
      steps: [{press: 'tab.list'}, {press: 'row'}],
      ready: {testID: 'chat.title'},
    },
  },
};
