import installSherlo from './installSherlo';
import installPods from './installPods';
import { printTitle } from '../helpers';
import { ProjectType } from '../types';

async function dependencies({
  projectType,
  sessionId,
}: {
  projectType: ProjectType;
  sessionId: string;
}) {
  printTitle('📦 Dependencies');

  await installSherlo(sessionId);

  if (projectType !== 'expo') {
    await installPods(sessionId);
  }
}

export default dependencies;
