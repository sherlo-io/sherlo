import chalk from 'chalk';
import { DOCS_LINK } from '../../../constants';
import { logInfo, wrapInBox } from '../../../helpers';
import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';

async function testing(sessionId: string | null): Promise<void> {
  printTitle('🧪 Testing');

  console.log(
    wrapInBox({
      type: 'warning',
      title: 'Before testing',
      text: `Make sure you have prepared proper ${chalk.bold('Builds')}`,
    })
  );

  console.log();

  console.log('To test your app run:');
  console.log('  ' + chalk.cyan('npx sherlo test'));

  console.log();

  logInfo({
    message: 'For CI/CD or automated testing, see docs for non-interactive commands',
    learnMoreLink: DOCS_LINK.testing,
  });

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    sessionId,
  });
}

export default testing;
