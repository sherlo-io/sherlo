import path from 'path';
import { getCwd, throwError } from '../../../helpers';
import { renderMetroConfigNeedsManualEdit } from '../../../render/initMetroConfig';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';
import readMetroConfigState from './readMetroConfigState';
import writeMetroConfigUpdate from './writeMetroConfigUpdate';

const STEP_NAME = 'Updated Metro config';

async function metroConfig(sessionId: string | null): Promise<void> {
  let state;
  try {
    state = await readMetroConfigState();
  } catch (error) {
    await trackProgress({ event: EVENT, params: { status: 'failed', error }, sessionId });
    throw error;
  }

  if (!state.path) {
    printLines(renderFailedStepLine('Updating Metro config failed'));
    await trackProgress({ event: EVENT, params: { status: 'failed:not_found' }, sessionId });
    throwError({ message: 'metro.config.js not found' });
    return;
  }

  const shownPath = path.relative(getCwd(), state.path);

  if (state.alreadyWrapped) {
    printLines([renderStepLine({ outcome: 'already', name: STEP_NAME, detail: shownPath })]);
    await trackProgress({
      event: EVENT,
      params: { status: 'already_updated', path: state.path },
      sessionId,
    });
    return;
  }

  if (!state.hasWithStorybook) {
    printLines(renderFailedStepLine('Updating Metro config failed'));
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
    printLines(renderMetroConfigNeedsManualEdit(shownPath));
    await trackProgress({
      event: EVENT,
      params: { status: 'failed:manual_edit', path: state.path },
      sessionId,
    });
    return;
  }

  printLines([renderStepLine({ outcome: 'done', name: STEP_NAME, detail: shownPath })]);
  await trackProgress({
    event: EVENT,
    params: { status: 'updated', path: state.path },
    sessionId,
  });
}

export default metroConfig;
