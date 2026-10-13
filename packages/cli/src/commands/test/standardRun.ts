/**
 * THE STANDARD ROAD of `sherlo test` - the run taken when the command is given
 * native build paths (see ./test.ts for the routing).
 *
 * It uploads the builds, registers them as the native base and runs a full
 * test on them with a freshly built bundle spliced in. Everything after the
 * option validation is the push spine, `uploadOrReuseBuildsAndRunTests`.
 */
import { getValidatedCommandParams, uploadOrReuseBuildsAndRunTests } from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';

async function standardRun(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: true }
  );

  // The developer passed the app builds, so no platform has a row above the test's.
  return uploadOrReuseBuildsAndRunTests({ commandParams, platformRows: [] });
}

export default standardRun;
