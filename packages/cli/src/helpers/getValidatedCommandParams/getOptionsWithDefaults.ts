import path from 'path';
import { DEFAULT_CONFIG_FILENAME, DEFAULT_PROJECT_ROOT } from '../../constants';
import { projectFiles } from '../../seams/projectFiles';
import { Options, Command } from '../../types';

/**
 * THE PROJECT ROOT IS RESOLVED FROM THE PROJECT-FOLDER SEAM, not from the process's own working
 * directory (../../seams/projectFiles).
 *
 * `--projectRoot` is a path like any other the user types, so it is resolved FROM the folder the
 * command runs against - which for a live run is where the user is standing, making this exactly
 * what `path.resolve('.', ...)` did before, and for a posed run is the folder the pose's `files`
 * were laid out in. One resolution, one place, and no command below it knows which it got.
 */
function getOptionsWithDefaults<C extends Command>(
  options: Options<C>
): Options<C, 'withDefaults'> {
  return {
    ...options,
    config: options.config || DEFAULT_CONFIG_FILENAME,
    projectRoot: path.resolve(projectFiles().root(), options.projectRoot || DEFAULT_PROJECT_ROOT),
  };
}

export default getOptionsWithDefaults;
