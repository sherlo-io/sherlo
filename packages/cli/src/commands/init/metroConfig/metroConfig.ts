import { throwError } from '../../../helpers';
import {
  renderMetroConfigAlreadyUpdated,
  renderMetroConfigNeedsManualEdit,
  renderMetroConfigNotFound,
  renderMetroConfigTitle,
  renderMetroConfigUpdated,
  renderMetroConfigWithoutWithStorybook,
} from '../../../render/initMetroConfig';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';
import readMetroConfigState from './readMetroConfigState';
import writeMetroConfigUpdate from './writeMetroConfigUpdate';

async function metroConfig(sessionId: string | null): Promise<void> {
  printLines(renderMetroConfigTitle());

  let state;
  try {
    state = await readMetroConfigState();
  } catch (error) {
    await trackProgress({ event: EVENT, params: { status: 'failed', error }, sessionId });
    throw error;
  }

  if (!state.path) {
    printLines(renderMetroConfigNotFound());
    await trackProgress({ event: EVENT, params: { status: 'failed:not_found' }, sessionId });
    throwError({ message: 'metro.config.js not found' });
    return;
  }

  if (state.alreadyWrapped) {
    printLines(renderMetroConfigAlreadyUpdated(state.path));
    await trackProgress({
      event: EVENT,
      params: { status: 'already_updated', path: state.path },
      sessionId,
    });
    return;
  }

  if (!state.hasWithStorybook) {
    printLines(renderMetroConfigWithoutWithStorybook(state.path));
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
    result = await writeMetroConfigUpdate({ path: state.path!, content: state.content! });
  } catch (error) {
    await trackProgress({
      event: EVENT,
      params: { status: 'failed', error, path: state.path },
      sessionId,
    });
    throw error;
  }

  if (!result.applied) {
    printLines(renderMetroConfigNeedsManualEdit(state.path));
    await trackProgress({
      event: EVENT,
      params: { status: 'failed:manual_edit', path: state.path },
      sessionId,
    });
    return;
  }

  printLines(renderMetroConfigUpdated(state.path));
  await trackProgress({
    event: EVENT,
    params: { status: 'updated', path: state.path },
    sessionId,
  });
}

export default metroConfig;
