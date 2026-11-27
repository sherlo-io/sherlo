/**
 * SCENES' START FILE, for a team with scenes on: Storybook's start file is made to open the app
 * outside Storybook mode, as a scene launch needs. The writing is dev's own
 * (../storybookAccess/writeStartFile); this step only says what happened, in one step line.
 *
 * Scenes off: nothing is read or written. A start file that already branches on Storybook mode
 * reads "(already done)". A start file setup leaves alone for another reason (none, the old setup,
 * not exactly one registration) prints nothing, as dev's step does.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { renderInitStepLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import writeStartFile from '../storybookAccess/writeStartFile';
import storybookFolder, { storybookFile } from './storybookFolder';

function startFileForScenes(): void {
  if (workstation().scenesFlag() !== 'on') return;

  const projectRoot = getCwd();
  const rewritten = writeStartFile(projectRoot);
  if (rewritten) {
    printLines([
      renderInitStepLine({
        step: 'set-up-for-scenes',
        outcome: 'done',
        detail: path.relative(projectRoot, rewritten),
      }),
    ]);
    return;
  }

  const folder = storybookFolder();
  if (!folder) return;
  const startFile = storybookFile(folder, 'index');
  const startFilePath = path.join(projectRoot, startFile);
  const alreadyBranches =
    fs.existsSync(startFilePath) &&
    /\bisStorybookMode\b/.test(fs.readFileSync(startFilePath, 'utf8'));
  if (!alreadyBranches) return;

  printLines([
    renderInitStepLine({ step: 'set-up-for-scenes', outcome: 'already', detail: startFile }),
  ]);
}

export default startFileForScenes;
