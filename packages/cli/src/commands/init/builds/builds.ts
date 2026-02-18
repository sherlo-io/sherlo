import chalk from 'chalk';
import { DOCS_LINK } from '../../../constants';
import { printLink } from '../../../helpers';
import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import printBuildWarning from './printBuildWarning';

async function builds({
  hasUpdatedStorybookComponent,
  sessionId,
}: {
  hasUpdatedStorybookComponent: boolean;
  sessionId: string | null;
}): Promise<void> {
  printTitle('📦 Builds');

  printBuildWarning(hasUpdatedStorybookComponent);

  console.log('Create builds aligned with your chosen testing method:');
  console.log('  ' + chalk.cyan(printLink(DOCS_LINK.builds)));

  await trackProgress({
    event: EVENT,
    params: { hasUpdatedStorybookComponent },
    sessionId,
  });
}

export default builds;
