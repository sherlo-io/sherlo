import {
  getValidatedCommandParams,
  printSherloIntro,
  uploadOrReuseBuildsAndRunTests,
  validatePackages,
} from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import { getValidatedEasUpdateData } from './helpers';

async function testEasUpdate(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

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

  const easUpdateData = await getValidatedEasUpdateData(commandParams);

  return uploadOrReuseBuildsAndRunTests({ commandParams, easUpdateData });
}

export default testEasUpdate;
