import chalk from 'chalk';
import { DOCS_LINK } from '../../../constants';
import { logWarning, throwError, wrapInBox } from '../../../helpers';
import { printSubtitle, printTitle, trackProgress, waitForEnterPress } from '../helpers';
import { EVENT } from './constants';
import getIntegratedStorybookCode from './getIntegratedStorybookCode';
import getStandaloneStorybookCode from './getStandaloneStorybookCode';

async function storybookAccess(sessionId: string): Promise<void> {
  printTitle('🔑 Storybook Access');

  console.log('To enable Sherlo to access Storybook, choose one:');

  printSubtitle('Option 1: Standalone Storybook');

  console.log(`  Provide a build that ${chalk.underline('opens straight into Storybook')}`);

  console.log();

  console.log(wrapInBox({ title: 'Root component', text: getStandaloneStorybookCode(), indent: 2 }));

  printSubtitle('Option 2: Integrated Storybook');

  console.log(
    `  Update your Root component ${chalk.italic('(could be App.jsx or app/_layout.jsx)')}:`
  );

  console.log();

  console.log(wrapInBox({ title: 'Root component', text: getIntegratedStorybookCode(), indent: 2 }));

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

  try {
    await waitForEnterPress();
  } catch (error) {
    console.log();
    console.log();

    throwError({ message: 'Setup cancelled' });
  }
}

export default storybookAccess;
