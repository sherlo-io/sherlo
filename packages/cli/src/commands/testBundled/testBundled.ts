/**
 * test:bundled command - the bundle-only fast path for staged builds.
 *
 * Builds a production plain-JS bundle + assets via the project's canonical
 * bundler, computes the base fingerprint, and constructs per-platform staged
 * run configs.  Server-side consume-mode is not yet available (SHERLO-1707),
 * so this command is gated behind SHERLO_DEVTOOLS=1 for internal testing.
 *
 * When SHERLO-1707 lands, the readiness gate is removed and the staged run
 * configs are wired into the openBuild call.
 */
import chalk from 'chalk';
import path from 'path';
import { TEST_STANDARD_COMMAND } from '../../constants';
import { Options } from '../../types';
import {
  getPlatformsToTest,
  getValidatedCommandParams,
  printSherloIntro,
  reporting,
} from '../../helpers';
import { computeBaseFingerprint } from '../../helpers/fingerprint';
import { THIS_COMMAND } from './constants';
import { buildBundleForPlatform } from './buildBundle';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function testBundled(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  // 1. Validate params (no platform binary paths required - bundle only).
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  // Determine which platforms have devices configured.
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  if (platformsToTest.length === 0) {
    console.log(
      chalk.yellow(
        'No devices configured. Add devices in sherlo.config.json to test on specific platforms.'
      )
    );
    await reporting.flush().finally(() => process.exit(1));
  }

  // 2. Readiness gate - staged uploads need server-side consume-mode which is
  //    still rolling out (SHERLO-1707).  Internal testing can bypass this gate
  //    with SHERLO_DEVTOOLS=1 to exercise the local pipeline.
  if (process.env.SHERLO_DEVTOOLS !== '1') {
    console.log(
      chalk.yellow(
        'Staged uploads require server support that is still rolling out (SHERLO-1707).\n' +
          `Run \`sherlo ${TEST_STANDARD_COMMAND}\` for a full build.`
      )
    );
    await reporting.flush().finally(() => process.exit(1));
  }

  console.log(chalk.bold('\n📦 Bundling for staged upload (devtools mode)...\n'));

  // 3. Compute base fingerprint - identifies which base binary to stage against.
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot);
  if (!fpResult.hash) {
    console.log(
      chalk.red(
        'Staged upload unavailable - ' + (fpResult.debugMessage ?? 'fingerprint computation failed')
      )
    );
    console.log(
      chalk.yellow(
        `Run \`sherlo ${TEST_STANDARD_COMMAND}\` for a full build with the same options.`
      )
    );
    await reporting.flush().finally(() => process.exit(1));
  }
  // 4. Build bundle + assets for each platform.
  for (const platform of platformsToTest) {
    const emoji = platform === 'android' ? '🤖' : '🍎';
    console.log(chalk.cyan(`\n${emoji} Building ${platform} bundle...`));

    try {
      const result = await buildBundleForPlatform({
        projectRoot: commandParams.projectRoot,
        platform,
      });
      console.log(
        chalk.green(`  ✓ Bundle: ${path.basename(result.bundlePath)}`) +
          ` (${result.bundleSizeMb} MB, ${result.bundleFormat}, ${result.bundler})`
      );
      if (result.assetsDest) {
        console.log(chalk.green(`  ✓ Assets: ${result.assetInventory.length} files`));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`\n  ✗ ${message}`));
      await reporting.flush().finally(() => process.exit(1));
    }
  }

  console.log(chalk.green('\n✓ Local pipeline complete (no server send - SHERLO-1707 pending)\n'));
  return { url: '' };
}

export default testBundled;
