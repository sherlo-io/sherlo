import {
  getValidatedCommandParams,
  printSherloIntro,
  uploadOrReuseBuildsAndRunTests,
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

  const easUpdateData = await getValidatedEasUpdateData(commandParams);

  return uploadOrReuseBuildsAndRunTests({ commandParams, easUpdateData });
}

export default testEasUpdate;
