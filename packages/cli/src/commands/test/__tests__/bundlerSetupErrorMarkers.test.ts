import { describe, expect, it } from 'vitest';

import { BUNDLER_SETUP_ERROR_MARKERS } from '../constants';

// The other side of the markers: the messages the SDK throws while the bundler loads its config,
// read from the sibling package's own files, so a reworded message turns this test red.
const {
  unknownSherloBuildMessage,
} = require('../../../../../react-native-storybook/metro/sherloBuild.js');
const {
  NO_APP_ENTRY_MESSAGE,
} = require('../../../../../react-native-storybook/metro/launchTimeEntry.js');

describe('the bundler setup error markers', () => {
  it('each marker is part of the SDK message it stands for', () => {
    const [unknownSherloBuildMarker, noAppEntryMarker] = BUNDLER_SETUP_ERROR_MARKERS;

    expect(unknownSherloBuildMessage('on')).toContain(unknownSherloBuildMarker);
    expect(NO_APP_ENTRY_MESSAGE).toContain(noAppEntryMarker);
  });
});
