/**
 * WHAT `sherlo init` PRINTS FOR BUILDS: a reminder to provide Storybook access first, and how the
 * app gets built - by `sherlo test` itself (epic sherlo-test-builds-apps), on the machine that runs
 * it or, in a project that builds on EAS, on EAS. Words by the content department (review of
 * 2026-10-07).
 *
 * Pure, like everything under ./: state in, print-call arguments out. The box wraps to the
 * terminal's width, which the caller reads and hands in.
 */
import chalk from 'chalk';
import { renderBox } from './box';
import { renderSectionTitle } from './initLines';

/** Where the app is built: on the machine that runs `sherlo test`, or on EAS. */
export type BuildPlace = 'local' | 'eas';

export function renderBuilds({
  terminalColumns,
  asksWhereToBuild,
}: {
  terminalColumns: number | undefined;
  /** A project with an eas.json, and somebody at the keyboard: the choice follows instead of the sentence. */
  asksWhereToBuild: boolean;
}): string[] {
  return [
    ...renderSectionTitle('📦 Builds'),
    renderBox({
      type: 'warning',
      title: 'Before building',
      text: `Make sure you have provided ${chalk.bold('Storybook Access')}`,
      terminalColumns,
    }),
    '',
    ...(asksWhereToBuild
      ? []
      : [
          '`npx sherlo test` builds your app with Gradle (Android) and Xcode (iOS) the first time, ' +
            'and again only when native code or build settings change.',
        ]),
  ];
}

/** The choice a project with an eas.json is offered: the question and the two places, by value. */
export function renderBuildPlaceQuestion(): {
  question: string;
  choices: { name: string; value: BuildPlace }[];
} {
  return {
    question: 'Where should Sherlo build your app?',
    choices: [
      { name: 'On the machine that runs `sherlo test` (Gradle and Xcode)', value: 'local' },
      { name: 'On EAS (with your eas.json)', value: 'eas' },
    ],
  };
}

/** What setup wrote for EAS mode. The profile line only when setup really added the profile. */
export function renderEasSetUp({ profileAdded }: { profileAdded: boolean }): string[] {
  // ONE space after the tick, as every line setup prints (the push's build lines take two).
  const done = (text: string) => `${chalk.green('✔')} ${text}`;
  return [
    done('Added "eas-build-on-complete" to package.json scripts'),
    ...(profileAdded ? [done('Added the "sherlo" profile to eas.json')] : []),
    '`npx sherlo test` starts the EAS builds, and they upload to Sherlo when they finish.',
  ];
}
