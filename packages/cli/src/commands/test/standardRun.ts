/**
 * THE STANDARD ROAD of `sherlo test` - the run taken when the command is given
 * native build paths (see ./test.ts for the routing).
 *
 * It uploads the builds, registers them as the native base and runs a full
 * test on them with a freshly built bundle spliced in. Everything after the
 * option validation is the push spine, `uploadOrReuseBuildsAndRunTests`.
 */
import {
  getValidatedCommandParams,
  printSherloIntro,
  uploadOrReuseBuildsAndRunTests,
} from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';

async function standardRun(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: true }
  );

  return uploadOrReuseBuildsAndRunTests({ commandParams });
}

export default standardRun;
