import {
  printHeader,
  uploadOrReuseBuildsAndRunTests,
  validatePackages,
  getValidatedCommandParams,
} from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import { getValidatedExpoUpdateData } from './helpers';

async function expoUpdate(
  passedOptions: Options<THIS_COMMAND>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  validatePackages(THIS_COMMAND);

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    {
      /*
       * Platform paths are not required upfront because we can reuse previously uploaded builds.
       * We require platform paths later (getBinaryInfo()) if:
       * - builds were not previously uploaded, or
       * - previously uploaded builds fail validation (e.g. contain outdated sherlo version)
       */
      requirePlatformPaths: false,
    }
  );

  const expoUpdateData = getValidatedExpoUpdateData(commandParams);

  return uploadOrReuseBuildsAndRunTests({ commandParams, expoUpdateData });
}

export default expoUpdate;
