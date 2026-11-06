import chalk from 'chalk';

/** The ending of a capture that found no app, as the screen needs it: `detail` is set with `why: 'old-code'`. */
export type NoAppEnding = { kind: 'no-app'; port: number; why?: 'old-code'; detail?: string };

/**
 * What `sherlo capture` prints when it found no app. An app that is attached but runs the code built
 * into it is said so, with the step that loads the current code (`detail`, written where the capture
 * ends); any other ending is that no app is attached to the bundler.
 */
export function noAppLines(state: NoAppEnding): string[] {
  if (state.why === 'old-code' && state.detail) {
    return [`${chalk.red('✖')}  ${state.detail}`, ''];
  }

  return [
    `${chalk.red('✖')}  A bundler is running on port ${chalk.bold(
      String(state.port)
    )}, and no Sherlo app is attached to it`,
    '',
    chalk.dim('Open the app on a device or simulator, then try again.'),
    '',
  ];
}
