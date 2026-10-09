/**
 * WHAT `sherlo init` PRINTS FOR TESTING, its last section: the push to run, and what that first push
 * sets up. `sherlo test` builds the app itself (epic sherlo-test-builds-apps), so there is no build
 * to prepare first; words by the content department (review of 2026-10-07).
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import chalk from 'chalk';
import { DOCS_LINK } from '../constants';
import { renderSectionTitle } from './initLines';
import { renderNotice } from './pushSpine';

export function renderTesting(): string[] {
  return [
    ...renderSectionTitle('🧪 Testing'),
    'To test your app, run:',
    '  ' + chalk.cyan('npx sherlo test'),
    '',
    renderNotice({
      level: 'info',
      message:
        'The first run builds your app and stores the app build. After that, `npx sherlo test` ' +
        'reuses it while only JavaScript changes.',
      learnMoreLink: DOCS_LINK.testing,
    }),
    '',
  ];
}
