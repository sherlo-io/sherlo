/**
 * WHICH PACKAGE MANAGER A FOLDER USES, as package-manager-detector names it, read off the project
 * itself: its lockfile, or package.json's `packageManager` field. Nothing is guessed: a folder with
 * neither stops setup with a refusal that names no tool, as npm or any other pick may not be the
 * person's. Setup checks the app first, so the stop comes before anything was changed.
 *
 * The detector tells modern Yarn (2 and newer, `yarn@berry`) only by a `packageManager`
 * field; a project without one, whose yarn.lock modern Yarn wrote, would be read as Yarn 1 and get
 * Yarn 1's commands and output reading. So a `yarn` answer is checked against what modern Yarn
 * leaves behind in the folder holding the lockfile: the `__metadata:` block it writes at the top of
 * every yarn.lock (Yarn 1 never writes it), or the `yarnPath:` its .yarnrc.yml points at a
 * checked-in Yarn release with.
 */
import fs from 'fs';
import path from 'path';
import { type Agent, detect } from 'package-manager-detector';
import { throwError } from '../../../helpers';
import { renderNoPackageManager } from '../../../render/initFixes';

async function detectPackageManager(folder: string): Promise<Agent> {
  const agent = (await detect({ cwd: folder }))?.agent;
  if (agent === undefined) return throwError(renderNoPackageManager());
  if (agent !== 'yarn') return agent;

  const lockFolder = folderHoldingYarnLock(folder);
  if (lockFolder === undefined) return agent;
  return isModernYarnFolder(lockFolder) ? 'yarn@berry' : agent;
}

export default detectPackageManager;

/* ========================================================================== */

/** The nearest folder at or above this one with a yarn.lock, walked as the detector walks. */
function folderHoldingYarnLock(folder: string): string | undefined {
  let directory = path.resolve(folder);
  const { root } = path.parse(directory);
  while (directory !== root) {
    if (fs.existsSync(path.join(directory, 'yarn.lock'))) return directory;
    directory = path.dirname(directory);
  }
  return undefined;
}

function isModernYarnFolder(lockFolder: string): boolean {
  const lockText = readText(path.join(lockFolder, 'yarn.lock'));
  if (/^__metadata:/m.test(lockText)) return true;

  const yarnrcText = readText(path.join(lockFolder, '.yarnrc.yml'));
  return /^yarnPath:/m.test(yarnrcText);
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}
