/**
 * WHAT `sherlo init` PRINTS FOR TESTING, its last section: the push to run, and what that first push
 * sets up. `sherlo test` builds the app itself, so there is no build to prepare first.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import chalk from 'chalk';
import { DOCS_LINK } from '../constants';
import { renderSectionTitle } from './initLines';
import { renderNotice } from './pushSpine';

/**
 * With scenes on for the team, setup tells where stories and scenes are covered and what to ask the
 * coding agent first. With them off, the same lines never say the word.
 */
export function renderTesting(scenesAreOn: boolean): string[] {
  const covered = scenesAreOn ? 'stories and scenes' : 'stories';
  const firstAsk = scenesAreOn ? 'one Sherlo scene and one Sherlo story' : 'one Sherlo story';
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
    `The Sherlo skill and AGENTS.md cover ${covered}.`,
    `Next: ask your coding agent to add ${firstAsk}`,
    '',
  ];
}
