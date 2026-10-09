/**
 * `sherlo build` - build the app into the local build cache, and push nothing.
 *
 * The same build `sherlo test` makes when a platform needs a new app build (../test/appBuild),
 * kept in the cache under its base fingerprint, platform and build settings. A later `sherlo test`
 * - in the same job, or a later one that restored the cache - takes it from there instead of
 * compiling, for as long as the native code and the build settings are unchanged. It needs no
 * token: nothing leaves the machine.
 *
 * Why it exists (epic sherlo-test-builds-apps): a CI pipeline that builds in one job and tests in
 * another, a team that warms the cache on a schedule, and the tester's own prestage, which builds
 * every fixture app once before its storylines push them.
 */
import { printSherloIntro } from '../../helpers';
import getNormalizedConfig from '../../helpers/getValidatedCommandParams/getNormalizedConfig';
import getNormalizedOptions from '../../helpers/getValidatedCommandParams/getNormalizedOptions';
import getOptionsWithDefaults from '../../helpers/getValidatedCommandParams/getOptionsWithDefaults';
import getPlatformsToTest from '../../helpers/getPlatformsToTest';
import { nativeBuild } from '../../seams/nativeBuild';
import type { Config } from '../../types';
import { buildApps } from '../test/appBuild/buildApps';
import { BUILD_COMMAND, type BuildFlags, type BuildSettings } from '../test/appBuild/buildSettings';

type BuildOptions = BuildFlags & { config?: string; projectRoot?: string };

async function build(passedOptions: BuildOptions): Promise<void> {
  printSherloIntro();

  const options = getNormalizedOptions(getOptionsWithDefaults(passedOptions as never));
  const config = getNormalizedConfig(options) as Config & { build?: BuildSettings };

  // The platforms the config tests, or the one `--platform` names.
  const platforms = getPlatformsToTest(config.devices ?? []).filter(
    (platform) => !passedOptions.platform || platform === passedOptions.platform
  );

  const fingerprint = await nativeBuild().computeFingerprint(options.projectRoot, BUILD_COMMAND);

  await buildApps({
    projectRoot: options.projectRoot,
    toBuild: platforms.map((platform) => ({ platform })),
    settings: config.build ?? {},
    baseFingerprint: fingerprint.hash ?? '',
    cacheDirFlag: passedOptions.buildCache,
    savedToCache: true,
  });
}

export default build;
