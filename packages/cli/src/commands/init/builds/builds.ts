import { renderBuilds } from '../../../render/initBuilds';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';

async function builds({ sessionId }: { sessionId: string | null }): Promise<void> {
  printLines(renderBuilds({ terminalColumns: process.stdout.columns }));

  await trackProgress({
    event: EVENT,
    params: {},
    sessionId,
  });
}

export default builds;
