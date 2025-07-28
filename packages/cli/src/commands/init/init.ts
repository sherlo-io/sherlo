import { printSherloIntro } from '../../helpers';
import { Options } from '../../types';
import builds from './builds';
import config from './config';
import { THIS_COMMAND } from './constants';
import dependencies from './dependencies';
import { trackProgress } from './helpers';
import needHelp from './needHelp';
import requirements from './requirements';
import storybookAccess from './storybookAccess';
import storybookComponent from './storybookComponent';
import testing from './testing';

async function init({ token }: Options<THIS_COMMAND>) {
  const { sessionId } = await trackProgress({
    event: '0_init',
    token,
    sessionId: null,
    hasStarted: true,
  });

  printSherloIntro();

  console.log('Initializing Sherlo in your project...');

  await requirements({ token, sessionId });

  await dependencies({ sessionId });

  const { hasUpdatedStorybookComponent } = await storybookComponent(sessionId);

  await storybookAccess(sessionId);

  await config({ sessionId, token });

  await builds({ hasUpdatedStorybookComponent, sessionId });

  await testing(sessionId);

  await needHelp(sessionId);
}

export default init;
