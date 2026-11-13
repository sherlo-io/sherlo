import fs from 'fs';
import path from 'path';
import { EXPO_PACKAGE_NAME } from '../../../constants';
import { getCwd, throwError } from '../../../helpers';
import { renderMetroConfigUnreadable } from '../../../render/initFixes';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { printLines, trackProgress } from '../helpers';
import getPackageVersion from '../requirements/getPackageVersion';
import { EVENT } from './constants';
import readMetroConfigState from './readMetroConfigState';
import writeMetroConfigUpdate from './writeMetroConfigUpdate';

const STEP_NAME = 'Updated Metro config';

/**
 * THE METRO CONFIG IS SETUP'S TO WIRE, never the person's: Storybook does not run without the
 * wrapper, so a missing config is
 * written and a config without withStorybook gets it. Only a shape setup cannot read stops the run,
 * and the project check has refused that one already, before the login.
 */
async function metroConfig(sessionId: string | null): Promise<void> {
  let state;
  try {
    state = await readMetroConfigState();
  } catch (error) {
    await trackProgress({ event: EVENT, params: { status: 'failed', error }, sessionId });
    throw error;
  }

  if (!state.path) {
    const createdPath = path.join(getCwd(), 'metro.config.js');
    await fs.promises.writeFile(
      createdPath,
      defaultMetroConfig({ isExpo: !!getPackageVersion(EXPO_PACKAGE_NAME) }),
      'utf-8'
    );
    printLines([
      renderStepLine({ outcome: 'done', name: 'Created Metro config', detail: 'metro.config.js' }),
    ]);
    await trackProgress({
      event: EVENT,
      params: { status: 'created', path: createdPath },
      sessionId,
    });
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
    printLines(renderFailedStepLine('Updating Metro config failed'));
    await trackProgress({
      event: EVENT,
      params: { status: 'failed:manual_edit', path: state.path },
      sessionId,
    });
    throwError(renderMetroConfigUnreadable({ path: shownPath }));
  }

  printLines([renderStepLine({ outcome: 'done', name: STEP_NAME, detail: shownPath })]);
  await trackProgress({
    event: EVENT,
    params: { status: 'updated', path: state.path },
    sessionId,
  });
}

export default metroConfig;

/* ========================================================================== */

/**
 * The config a project with none gets: the framework's own defaults, wrapped in Sherlo's
 * withStorybook - Expo's from expo/metro-config, a bare app's merged from @react-native/metro-config.
 */
function defaultMetroConfig({ isExpo }: { isExpo: boolean }): string {
  return isExpo
    ? [
        "const { getDefaultConfig } = require('expo/metro-config');",
        "const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');",
        '',
        'const config = getDefaultConfig(__dirname);',
        '',
        'module.exports = withStorybook(config);',
        '',
      ].join('\n')
    : [
        "const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');",
        "const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');",
        '',
        'const config = mergeConfig(getDefaultConfig(__dirname), {});',
        '',
        'module.exports = withStorybook(config);',
        '',
      ].join('\n');
}
