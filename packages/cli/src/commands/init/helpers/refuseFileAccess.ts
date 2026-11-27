import fs from 'fs';
import path from 'path';
import { getCwd, throwError } from '../../../helpers';
import { renderFileAccessFailed } from '../../../render/initFixes';
import { type FailedInitStep, renderFailedInitStepLine } from '../../../render/initSteps';
import printLines from './printLines';

/**
 * A file of the app the system would not let setup read or write: a folder where the file goes, a
 * file where a folder goes, no permission. The person's to fix, so it is refused and never reported
 * as Sherlo's bug. What is in the way is found by looking at the path (`whatBlocks`) and named with
 * its fix; only when nothing on the path is in the way are the system's own words shown.
 *
 * `failedStep` is the step that stopped, marked red above the refusal; null when the caller marks
 * it itself. The system's message ends on the call and the full path (", open '/Users/...'"), which
 * the refusal already names from the app's folder, so that tail is cut.
 */
function refuseFileAccess({
  failedStep,
  access,
  file,
  error,
}: {
  failedStep: FailedInitStep | null;
  access: 'read' | 'write';
  /** The file's full path. */
  file: string;
  error: unknown;
}): never {
  if (failedStep) printLines(renderFailedInitStepLine(failedStep));

  const blocker = whatBlocks(file);
  return throwError(
    renderFileAccessFailed({
      access,
      file: path.relative(getCwd(), file),
      cause: blocker
        ? { blocker }
        : { reason: (error as Error).message.replace(/, \w+ '[^']*'$/, '') },
    })
  );
}

export default refuseFileAccess;

/**
 * A FILE SETUP WILL WRITE LATER, checked while setup checks the app: a path something already
 * stands in the way of is refused then, before the login, rather than after a project was made.
 */
export function refuseBlockedPath(file: string): void {
  const blocker = whatBlocks(file);
  if (!blocker) return;
  throwError(
    renderFileAccessFailed({
      access: 'write',
      file: path.relative(getCwd(), file),
      cause: { blocker },
    })
  );
}

/**
 * WHAT ON THE PATH STANDS WHERE THE FILE GOES, with its fix, named from the app's folder: the file
 * itself is a folder ("metro.config.js is a folder: remove it"), or a folder on the way to it is a
 * file (".github is a file, not a folder: rename or remove it"). Null when neither is so, for a
 * reason the path does not show (no permission, a full disk).
 */
export function whatBlocks(file: string): string | null {
  const named = (target: string): string => path.relative(getCwd(), target);

  if (statOf(file)?.isDirectory()) {
    return `${named(file)} is a folder: remove it`;
  }

  let folder = path.dirname(file);
  while (true) {
    const stat = statOf(folder);
    if (stat) {
      return stat.isDirectory()
        ? null
        : `${named(folder)} is a file, not a folder: rename or remove it`;
    }
    const parent = path.dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}

/**
 * What is at the path, or null when nothing is. A path running through a file ("ENOTDIR") holds
 * nothing either; stat's `throwIfNoEntry` covers only a missing entry, so both are caught here.
 */
function statOf(target: string): fs.Stats | null {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}
