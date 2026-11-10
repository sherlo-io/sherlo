import { printSherloIntro } from '../../helpers';
import { workstation } from '../../seams/workstation';
import { Options } from '../../types';
import builds from './builds';
import config from './config';
import { THIS_COMMAND } from './constants';
import dependencies from './dependencies';
import { trackProgress } from './helpers';
import metroConfig from './metroConfig';
import project from './project';
import requirements from './requirements';
import storybookAccess from './storybookAccess';
import testing from './testing';

async function init(options: Options<THIS_COMMAND>) {
  const { token } = options;

  const { sessionId } = await trackProgress({
    event: '0_init',
    token,
    sessionId: null,
    hasStarted: true,
  });

  printSherloIntro();

  await requirements({ token, sessionId });

  // Before anything is installed, so a run that cannot name a project changes nothing.
  const projectToWrite = await project(options);

  // From the project it chose, not the folder it started in: that folder may not name one yet.
  await workstation().askScenesFlag(projectToWrite);

  await dependencies({ sessionId });

  await metroConfig(sessionId);

  await storybookAccess(sessionId);

  await config({ sessionId, project: projectToWrite });

  await builds({ sessionId });

  await testing(sessionId);
}

export default init;
