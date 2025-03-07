import chalk from 'chalk';
import { DOCS_LINK } from '../../../constants';
import { logWarning } from '../../../helpers';
import { printSubtitle, printTitle, waitForKeyPress, wrapInBox, trackProgress } from '../helpers';
import { EVENT } from './constants';
import getSherloSolutionCode from './getSherloSolutionCode';

async function storybookAccess(sessionId: string): Promise<void> {
  printTitle('🔑 Storybook Access');

  console.log('To enable Sherlo to launch Storybook, choose one of these options:');

  printSubtitle('Option 1: Custom Solution');

  console.log(
    `If you can make a build that ${chalk.underline('renders Storybook on launch')} - that's it!`
  );

  printSubtitle('Option 2: Sherlo Solution');

  console.log(
    `Otherwise, update your Root component ${chalk.italic(
      '(could be App.jsx or app/_layout.jsx)'
    )}:`
  );

  console.log();

  console.log(wrapInBox({ title: 'Root component', text: getSherloSolutionCode() }));

  console.log();

  logWarning({
    message: 'Provide Storybook access by choosing one of the options above',
    learnMoreLink: DOCS_LINK.setupStorybookAccess,
  });

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    sessionId,
  });

  await waitForKeyPress();
}

export default storybookAccess;
