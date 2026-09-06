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
  console.log('  ' + chalk.cyan('npx sherlo test --android <path> --ios <path>'));

  console.log();

  logInfo({
    message:
      'That first run registers your builds as the base. After it, plain `npx sherlo test` ' +
      'tests JS-only changes with no native rebuild, and tells you when a fresh native build is needed',
    learnMoreLink: DOCS_LINK.testing,
  });

  console.log();

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    hasFinished: true,
    sessionId,
  });
}

export default testing;
