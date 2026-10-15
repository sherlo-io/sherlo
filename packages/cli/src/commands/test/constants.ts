import { TEST_COMMAND } from '../../constants';

export const THIS_COMMAND = TEST_COMMAND;
export type THIS_COMMAND = typeof THIS_COMMAND;

/**
 * What the bundler's SHERLO_BUILD is set to for a push: Storybook alone, on
 * Storybook's default setup. The CLI only writes this value; the SDK parses it.
 */
export const SHERLO_BUILD_FOR_PUSH = 'storybook';

/**
 * The starts of the messages the SDK throws when the bundler must stop on a setup
 * problem: an unknown SHERLO_BUILD value, or no app entry file.
 * bundlerSetupErrorMarkers.test.ts checks each against the SDK's own message.
 */
export const BUNDLER_SETUP_ERROR_MARKERS = [
  'Unknown SHERLO_BUILD value',
  "Sherlo could not find your app's entry file",
] as const;

/** Approved line `cli.test.bundler-setup-error`. */
export const BUNDLER_SETUP_ERROR_LINE =
  'The bundler stopped because of a setup problem. Its message above says what to fix.';
