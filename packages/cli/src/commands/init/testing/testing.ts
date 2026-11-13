import { renderTesting } from '../../../render/initTesting';
import { workstation } from '../../../seams/workstation';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';

async function testing(sessionId: string | null): Promise<void> {
  printLines(renderTesting(workstation().scenesFlag() === 'on'));

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    hasFinished: true,
    sessionId,
  });
}

export default testing;
