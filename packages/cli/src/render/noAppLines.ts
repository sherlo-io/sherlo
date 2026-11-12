import chalk from 'chalk';
import { DEFAULT_BUNDLER_PORT } from '../constants';
import type { PortTheAppAsks } from '../seams/appBundlerPort';

/**
 * The ending of a capture that found no app, as the screen needs it: `detail` is set with
 * `why: 'old-code'`, and `appAsks` when the app asks its bundler on another port than `port`.
 */
export type NoAppEnding = {
  kind: 'no-app';
  port: number;
  why?: 'old-code';
  detail?: string;
  appAsks?: PortTheAppAsks;
};

/**
 * What `sherlo capture` prints when it found no app. An app that asks its bundler on another port
 * is told that port and the command that points it at this one: it runs the code built into it for
 * that reason, so it is never told it runs old code. An app that is attached but runs the code
 * built into it is said so, with the step that loads the current code (`detail`, written where the
 * capture ends); any other ending is that no app is attached to the bundler.
 */
export function noAppLines(state: NoAppEnding): string[] {
  if (state.why === 'old-code' && state.detail && !state.appAsks) {
    return [`${chalk.red('✖')}  ${state.detail}`, ''];
  }

  return [
    `${chalk.red('✖')}  A bundler is running on port ${chalk.bold(
      String(state.port)
    )}, and no Sherlo app is attached to it`,
    '',
    chalk.dim(
      state.appAsks
        ? `The app asks for its bundler on port ${state.appAsks.port}, not ${state.port}. ` +
            `Point it at ${state.port}, then restart the app: ${pointCommand(state.appAsks, state.port)}`
        : 'Open the app on a device or simulator, then try again.'
    ),
    '',
  ];
}

/** The one command that points the app on its device at the bundler on `port`. */
function pointCommand(asks: PortTheAppAsks, port: number): string {
  return asks.platform === 'ios'
    ? `xcrun simctl spawn ${asks.udid} defaults write ${asks.appId} RCT_jsLocation localhost:${port}`
    : `adb -s ${asks.serial} reverse tcp:${DEFAULT_BUNDLER_PORT} tcp:${port}`;
}
