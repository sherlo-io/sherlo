import { printSherloIntro } from '../../helpers';
import { Options } from '../../types';
import builds from './builds';
import config from './config';
import { THIS_COMMAND } from './constants';
import dependencies from './dependencies';
import { trackProgress } from './helpers';
import metroConfig from './metroConfig';
import requirements from './requirements';
import storybookAccess from './storybookAccess';
import testing from './testing';

async function init({ token }: Options<THIS_COMMAND>) {
  const { sessionId } = await trackProgress({
    event: '0_init',
    token,
    sessionId: null,
    hasStarted: true,
  });

  printSherloIntro();

  await requirements({ token, sessionId });

  await dependencies({ sessionId });

  await metroConfig(sessionId);

  await storybookAccess(sessionId);

  await config({ sessionId, token });

  await builds({ sessionId });

  await testing(sessionId);
}

export default init;
