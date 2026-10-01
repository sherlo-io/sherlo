import { renderNeedHelp } from '../../../render/initNeedHelp';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';

async function needHelp(sessionId: string | null): Promise<void> {
  printLines(renderNeedHelp());

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    sessionId,
    hasFinished: true,
  });
}

export default needHelp;
