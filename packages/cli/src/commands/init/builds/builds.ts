import chalk from 'chalk';
import { DOCS_LINK } from '../../../constants';
import { printLink } from '../../../helpers';
import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import printBuildWarning from './printBuildWarning';

async function builds({ sessionId }: { sessionId: string | null }): Promise<void> {
  printTitle('📦 Builds');

  printBuildWarning();

  console.log('Create builds aligned with your chosen testing method:');
  console.log('  ' + chalk.cyan(printLink(DOCS_LINK.builds)));

  await trackProgress({
    event: EVENT,
    params: {},
    sessionId,
  });
}

export default builds;
