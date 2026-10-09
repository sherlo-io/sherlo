import { throwError } from '../../../helpers';
import { renderStorybookAccess } from '../../../render/initStorybookAccess';
import { printLines, trackProgress, waitForEnterPress } from '../helpers';
import { EVENT } from './constants';

async function storybookAccess(sessionId: string | null): Promise<void> {
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
