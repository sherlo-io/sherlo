import {
  getValidatedCommandParams,
  printSherloIntro,
  uploadOrReuseBuildsAndRunTests,
  validateLocalBinaries,
} from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import { getValidatedEasUpdateData } from './helpers';

async function testEasUpdate(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: true }
  );

  // Validate local binaries before expensive EAS operations (expo config + eas-cli)
  // Catches wrong build type, missing Sherlo, outdated SDK, missing expo-dev-client early
  await validateLocalBinaries({ commandParams, command: THIS_COMMAND });

  const easUpdateData = await getValidatedEasUpdateData(commandParams);

  return uploadOrReuseBuildsAndRunTests({ commandParams, easUpdateData });
}

export default testEasUpdate;
