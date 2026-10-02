/**
 * WHAT `sherlo init` PRINTS FOR TESTING, its last section: a reminder to prepare the builds first,
 * the push to run, and what that first push sets up.
 *
 * Pure, like everything under ./: state in, print-call arguments out. The box wraps to the
 * terminal's width, which the caller reads and hands in.
 */
import chalk from 'chalk';
import { DOCS_LINK } from '../constants';
import { renderBox } from './box';
import { renderSectionTitle } from './initLines';
import { renderNotice } from './pushSpine';

export function renderTesting({
  terminalColumns,
}: {
  terminalColumns: number | undefined;
}): string[] {
  return [
    ...renderSectionTitle('🧪 Testing'),
    renderBox({
      type: 'warning',
      title: 'Before testing',
      text: `Make sure you have prepared proper ${chalk.bold('Builds')}`,
      terminalColumns,
    }),
    '',
    'To test your app run:',
    '  ' + chalk.cyan('npx sherlo test --android <path> --ios <path>'),
    '',
    renderNotice({
      level: 'info',
      message:
        'That first run registers your builds as the base. After it, plain `npx sherlo test` ' +
        'tests JS-only changes with no native rebuild, and tells you when a fresh native build is needed',
      learnMoreLink: DOCS_LINK.testing,
    }),
    '',
  ];
}
