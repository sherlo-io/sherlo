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
import requirements, { settleNoStorybook } from './requirements';
import scheme from './scheme';
import skill from './skill';
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

  const { appHasStorybook } = await requirements({ token, sessionId });

  // Before anything is installed, so a run that cannot name a project changes nothing.
  // An app with no Storybook is welcome only for a team with scenes on, and the team is known only
  // inside the project step (after the login, and the "React Native" line already printed). So the
  // step asks, as soon as it knows the team and before it makes a team or a project, whether to go on.
  const projectToWrite = await project(
    options,
    appHasStorybook ? undefined : (teamId) => settleNoStorybook({ teamId, sessionId })
  );

  // From the project it chose, not the folder it started in: that folder may not name one yet.
  await workstation().askScenesFlag(projectToWrite);

  await dependencies({ sessionId });

  if (appHasStorybook) {
    await metroConfig(sessionId);

    await storybookAccess(sessionId);
  }

  await config({ sessionId, project: projectToWrite });

  // Into the config just written, so the first push does not stop on an iOS scheme it cannot pick.
  await scheme();

  await builds({ sessionId });

  // Prints nothing: the testing lines below name the guide it leaves for the coding agent.
  await skill();

  await testing(sessionId);
}

export default init;
