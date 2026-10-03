/**
 * WHAT `sherlo init` PRINTS FOR BUILDS: a reminder to provide Storybook access first, and where to
 * read about making the app binaries.
 *
 * Pure, like everything under ./: state in, print-call arguments out. The box wraps to the
 * terminal's width, which the caller reads and hands in.
 */
import chalk from 'chalk';
import { DOCS_LINK } from '../constants';
import { renderBox } from './box';
import { renderSectionTitle } from './initLines';
import { formatLink } from './pushSpine';

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
    'Create builds aligned with your chosen testing method:',
    '  ' + chalk.cyan(formatLink(DOCS_LINK.builds)),
  ];
}
