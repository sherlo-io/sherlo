import path from 'path';
import chalk from 'chalk';
import { getCwd, throwError } from '../../../helpers';
import { renderStorybookAccess } from '../../../render/initStorybookAccess';
import { printLines, trackProgress, waitForEnterPress } from '../helpers';
import storybookFolder from '../steps/storybookFolder';
import { EVENT } from './constants';
import writeStartFile from './writeStartFile';

async function storybookAccess(sessionId: string | null): Promise<void> {
  const projectRoot = getCwd();
  const folder = storybookFolder();
  const startFile = folder ? writeStartFile(projectRoot, folder) : null;
  if (startFile && 'written' in startFile) {
    console.log(
      `${chalk.green('✔')} ${path.relative(projectRoot, startFile.written)} opens Storybook in Storybook mode and your app otherwise`
    );
  }

  printLines(renderStorybookAccess({ terminalColumns: process.stdout.columns }));

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
