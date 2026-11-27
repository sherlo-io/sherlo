/**
 * SCENES' START FILE, for a team with scenes on: Storybook's start file is made to open the app
 * outside Storybook mode, as a scene launch needs. The writing is dev's own
 * (../storybookAccess/writeStartFile); this step says what happened, in one step line.
 *
 * Scenes off: nothing is read or written. A start file that already branches on Storybook mode
 * reads "(already done)". One that registers nothing yet (just installed, or the old setup), or is
 * not there, prints no line: the next step prints its registration, or the whole file, branched, and
 * this step answers the app entry that registration requires. One setup cannot make branch prints
 * why scenes can't start yet, and the fix.
 */
import path from 'path';
import { getCwd } from '../../../helpers';
import { renderInitStepLine, renderScenesCantStartLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import writeStartFile from '../storybookAccess/writeStartFile';
import storybookFolder, { storybookFile } from './storybookFolder';

/** Writes the start file for scenes; answers the app entry the next step's registration requires, or null. */
function startFileForScenes(): string | null {
  if (workstation().scenesFlag() !== 'on') return null;
  // Setup stopped at its check on an app with no Storybook folder, so one is found here.
  const folder = storybookFolder();
  if (!folder) return null;

  const projectRoot = getCwd();
  const outcome = writeStartFile(projectRoot, folder);
  if ('unregistered' in outcome || 'missing' in outcome) return outcome.appRequest;

  if ('left' in outcome) {
    printLines([
      renderScenesCantStartLine({
        reason: outcome.left,
        startFile: storybookFile(folder, 'index'),
      }),
    ]);
    return null;
  }

  const startFile = 'written' in outcome ? outcome.written : outcome.already;
  printLines([
    renderInitStepLine({
      step: 'updated-storybook-start-file',
      outcome: 'written' in outcome ? 'done' : 'already',
      detail: path.relative(projectRoot, startFile),
    }),
  ]);
  return null;
}

export default startFileForScenes;
