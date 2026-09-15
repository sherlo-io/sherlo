import path from 'path';
import { DEFAULT_CONFIG_FILENAME, DEFAULT_PROJECT_ROOT } from '../../../constants';
import { projectFiles } from '../../../seams/projectFiles';

/**
 * WHERE THE CONFIG FILE IS, for a command line - the one answer, for every road that asks.
 *
 * There used to be two: `./getNormalizedConfig` resolved it for the road that reads the config,
 * and `commands/test/simWorld` resolved it again for the sim check `test.ts` makes BEFORE that
 * road is entered. Two copies of one rule is how a project root can be honoured on one road and
 * ignored on the next - which is exactly what happened the first time a command was posed
 * against a project folder that was not the process's own.
 *
 * Both halves are resolved from the project-folder seam (../../../seams/projectFiles): on a live
 * run that is the folder the user is standing in, so this is precisely what `path.resolve('.',
 * ...)` always did.
 */
export function resolveConfigPath(options: { config?: string; projectRoot?: string }): string {
  const projectRoot = path.resolve(
    projectFiles().root(),
    options.projectRoot || DEFAULT_PROJECT_ROOT
  );

  return path.resolve(projectRoot, options.config || DEFAULT_CONFIG_FILENAME);
}

export default resolveConfigPath;
