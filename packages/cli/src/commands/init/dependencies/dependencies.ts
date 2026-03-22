import { existsSync } from 'fs';
import { join } from 'path';
import { getCwd } from '../../../helpers';
import { printTitle, trackProgress } from '../helpers';
import { EVENT, IOS_DIR } from './constants';
import installPods from './installPods';
import installSherlo from './installSherlo';

async function dependencies({ sessionId }: { sessionId: string | null }) {
  printTitle('💾 Dependencies');

  try {
    await installSherlo();

    if (iosDirectoryWithPodfileExists()) {
      await installPods();
    }
  } catch (error) {
    await trackProgress({
      event: EVENT,
      params: { status: 'failed', error },
      sessionId,
    });
    throw error;
  }

  await trackProgress({
    event: EVENT,
    params: { status: 'success' },
    sessionId,
  });
}

export default dependencies;

/* ========================================================================== */

function iosDirectoryWithPodfileExists(): boolean {
  const iosDirPath = join(getCwd(), IOS_DIR);
  const podfilePath = join(iosDirPath, 'Podfile');

  return existsSync(iosDirPath) && existsSync(podfilePath);
}
