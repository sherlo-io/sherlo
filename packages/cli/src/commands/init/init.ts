import { printSherloIntro } from '../../helpers';
import { Options } from '../../types';
import buildAndTest from './buildAndTest';
import { THIS_COMMAND } from './constants';
import dependencies from './dependencies';
import needHelp from './needHelp';
import projectDetection from './projectDetection';
import sherloConfig from './sherloConfig';
import storybookAccess from './storybookAccess';
import storybookComponent from './storybookComponent';
import validateProject from './validateProject';

async function init({ token }: Options<THIS_COMMAND>) {
  printSherloIntro();

  console.log('Initializing Sherlo in your project...');

  const { projectType } = await validateProject(token);

  const { sessionId } = await projectDetection({ projectType, token });

  await dependencies({ projectType, sessionId });

  const { hasUpdatedStorybookComponent } = await storybookComponent(sessionId);

  await storybookAccess(sessionId);

  await sherloConfig({ sessionId, token });

  await buildAndTest({ hasUpdatedStorybookComponent, projectType, sessionId });

  await needHelp(sessionId);
}

export default init;
