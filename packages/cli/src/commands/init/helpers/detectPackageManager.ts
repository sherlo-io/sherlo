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
import { type Agent, detect, LOCKS } from 'package-manager-detector';
import { getCwd, throwError } from '../../../helpers';
import { renderNoPackageManager, renderTwoLockfiles } from '../../../render/initFixes';

async function detectPackageManager(folder: string): Promise<Agent> {
  refuseTwoLockfiles(folder);

  const agent = (await detect({ cwd: folder }))?.agent;
  if (agent === undefined) return throwError(renderNoPackageManager());
  if (agent !== 'yarn') return agent;

  const lockFolder = folderHoldingYarnLock(folder);
  if (lockFolder === undefined) return agent;
  return isModernYarnFolder(lockFolder) ? 'yarn@berry' : agent;
}

export default detectPackageManager;

/* ========================================================================== */

/**
 * TWO MANAGERS' LOCKFILES ARE REFUSED, NEVER PICKED BETWEEN: the detector stops at the nearest
 * folder holding any lockfile and, with no `packageManager` field there, takes the first in its own
 * order (bun, deno, pnpm, yarn, npm), which says nothing about which one the person runs. A field
 * there settles it, as it settles it for the detector. bun.lock beside bun.lockb is one manager.
 */
function refuseTwoLockfiles(folder: string): void {
  let directory = path.resolve(folder);
  const { root } = path.parse(directory);
  while (directory !== root) {
    const lockfiles = Object.keys(LOCKS).filter((lockfile) =>
      isFile(path.join(directory, lockfile))
    );
    if (lockfiles.length > 0) {
      const managers = new Set(lockfiles.map((lockfile) => LOCKS[lockfile]));
      if (managers.size > 1 && !hasPackageManagerField(path.join(directory, 'package.json'))) {
        throwError(
          renderTwoLockfiles({
            lockfiles: lockfiles.map((lockfile) =>
              path.relative(getCwd(), path.join(directory, lockfile))
            ),
          })
        );
      }
      return;
    }
    directory = path.dirname(directory);
  }
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function hasPackageManagerField(packageJson: string): boolean {
  try {
    return typeof JSON.parse(readText(packageJson)).packageManager === 'string';
  } catch {
    return false;
  }
}

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
