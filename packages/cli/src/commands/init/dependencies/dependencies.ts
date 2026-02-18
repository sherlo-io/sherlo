import { existsSync } from 'fs';
import { join } from 'path';
import { getCwd } from '../../../helpers';
import { printTitle } from '../helpers';
import { IOS_DIR } from './constants';
import installPods from './installPods';
import installSherlo from './installSherlo';

async function dependencies({ sessionId }: { sessionId: string | null }) {
  printTitle('💾 Dependencies');

  await installSherlo(sessionId);

  if (iosDirectoryWithPodfileExists()) {
    await installPods(sessionId);
  }
}

export default dependencies;

/* ========================================================================== */

function iosDirectoryWithPodfileExists(): boolean {
  const iosDirPath = join(getCwd(), IOS_DIR);
  const podfilePath = join(iosDirPath, 'Podfile');

  return existsSync(iosDirPath) && existsSync(podfilePath);
}
