import { renderTesting } from '../../../render/initTesting';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';

async function testing(sessionId: string | null): Promise<void> {
  printLines(renderTesting({ terminalColumns: process.stdout.columns }));

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    hasFinished: true,
    sessionId,
  });
}

export default testing;
