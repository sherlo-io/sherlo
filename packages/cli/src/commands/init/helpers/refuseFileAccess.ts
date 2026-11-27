import path from 'path';
import { getCwd, throwError } from '../../../helpers';
import { renderFileAccessFailed } from '../../../render/initFixes';
import { type FailedInitStep, renderFailedInitStepLine } from '../../../render/initSteps';
import printLines from './printLines';

/**
 * A file of the app the system would not let setup read or write: a folder where the file goes, a
 * file where a folder goes, no permission. The person's to fix, so it is refused with the system's
 * own words and never reported as Sherlo's bug.
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

  return throwError(
    renderFileAccessFailed({
      access,
      file: path.relative(getCwd(), file),
      reason: (error as Error).message.replace(/, \w+ '[^']*'$/, ''),
    })
  );
}

export default refuseFileAccess;
