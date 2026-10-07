/**
 * WHAT `sherlo init` PRINTS FOR BUILDS: a reminder to provide Storybook access first, and how the
 * app gets built - by `sherlo test` itself (epic sherlo-test-builds-apps). Words by the content
 * department (review of 2026-10-07).
 *
 * Pure, like everything under ./: state in, print-call arguments out. The box wraps to the
 * terminal's width, which the caller reads and hands in.
 */
import chalk from 'chalk';
import { renderBox } from './box';
import { renderSectionTitle } from './initLines';

export function renderBuilds({
  terminalColumns,
}: {
  terminalColumns: number | undefined;
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
    '`npx sherlo test` builds your app with Gradle (Android) and Xcode (iOS) on the first run, ' +
      'and again only when native code or build settings change.',
  ];
}
