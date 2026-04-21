import { DOCS_LINK } from '../../../constants';
import { logWarning, throwError } from '../../../helpers';
import { printMessage, printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import readMetroConfigState from './readMetroConfigState';
import writeMetroConfigUpdate from './writeMetroConfigUpdate';

async function metroConfig(sessionId: string | null): Promise<void> {
  printTitle('🧩 Metro Config');

  let state;
  try {
    state = await readMetroConfigState();
  } catch (error) {
    await trackProgress({ event: EVENT, params: { status: 'failed', error }, sessionId });
    throw error;
  }

  if (!state.path) {
    logWarning({
      message: 'metro.config.js not found - complete Storybook setup first',
      learnMoreLink: 'https://github.com/storybookjs/react-native#setup',
    });
    await trackProgress({ event: EVENT, params: { status: 'failed:not_found' }, sessionId });
    throwError({ message: 'metro.config.js not found' });
    return;
  }

  if (state.alreadyWrapped) {
    printMessage({ type: 'success', message: `Already updated: ${state.path}` });
    await trackProgress({
      event: EVENT,
      params: { status: 'already_updated', path: state.path },
      sessionId,
    });
    return;
  }

  if (!state.hasWithStorybook) {
    printMessage({ type: 'fail', message: `${state.path} has no withStorybook(...) call` });
    logWarning({
      message: 'Complete Storybook integration in metro.config.js first',
      learnMoreLink: 'https://github.com/storybookjs/react-native#setup',
    });
    await trackProgress({
      event: EVENT,
      params: { status: 'failed:no_with_storybook', path: state.path },
      sessionId,
    });
    throwError({ message: 'withStorybook(...) not found in metro.config.js' });
    return;
  }

  let result;
  try {
    result = await writeMetroConfigUpdate(state as { path: string; content: string; quoteChar: '"' | "'" });
  } catch (error) {
    await trackProgress({
      event: EVENT,
      params: { status: 'failed', error, path: state.path },
      sessionId,
    });
    throw error;
  }

  if (!result.applied) {
    printMessage({ type: 'fail', message: `Could not automatically update ${state.path}` });
    logWarning({
      message: 'metro.config.js has a non-standard shape - add withSherlo(...) wrap manually',
      learnMoreLink: DOCS_LINK.setupMetroConfig,
    });
    await trackProgress({
      event: EVENT,
      params: { status: 'failed:manual_edit', path: state.path },
      sessionId,
    });
    return;
  }

  printMessage({ type: 'success', message: `Updated: ${state.path}` });
  await trackProgress({
    event: EVENT,
    params: { status: 'updated', path: state.path },
    sessionId,
  });
}

export default metroConfig;
