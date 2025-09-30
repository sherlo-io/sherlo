import {
  getValidatedCommandParams,
  printSherloIntro,
  uploadOrReuseBuildsAndRunTests,
  validatePackages,
} from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';

async function testStandard(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  validatePackages(THIS_COMMAND);

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: true }
  );

  return uploadOrReuseBuildsAndRunTests({ commandParams });
}

export default testStandard;
