import chalk from 'chalk';
import { DOCS_LINK } from '../../../constants';
import { printLink } from '../../../helpers';
import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import printTestingCommands from './printTestingCommands';

async function testing(sessionId: string): Promise<void> {
  printTitle('🧪 Testing');

  console.log('Run your chosen command to test your app');

  console.log();

  printTestingCommands();

  console.log();

  console.log(`Learn more: ${chalk.cyan(printLink(DOCS_LINK.testing))}`);

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    sessionId,
  });
}

export default testing;
