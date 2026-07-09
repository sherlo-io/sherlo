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
import { Platform } from '@sherlo/api-types';
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
import { buildBundleForPlatform, type BundleResult } from './buildBundle';
import { buildStagedRunConfig } from './buildStagedRunConfig';

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
  // Safe: guarded by the !fpResult.hash check above which calls process.exit(1).
  const baseFingerprint: string = fpResult.hash!;

  // 4. Build bundle + assets for each platform.
  const bundleResults = new Map<Platform, BundleResult>();

  for (const platform of platformsToTest) {
    const emoji = platform === 'android' ? '🤖' : '🍎';
    console.log(chalk.cyan(`\n${emoji} Building ${platform} bundle...`));

    try {
      const result = await buildBundleForPlatform({
        projectRoot: commandParams.projectRoot,
        platform,
      });
      bundleResults.set(platform, result);
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

  // 5. Construct per-platform staged run configs (cement the sherlo-runner#94
  //    contract).  These are NOT sent to the server yet - wiring them into
  //    the openBuild call happens when SHERLO-1707 lands.
  for (const platform of platformsToTest) {
    const result = bundleResults.get(platform)!;
    const config = buildStagedRunConfig({
      baseReference: baseFingerprint,
      jsBundleUrl: '', // placeholder - not uploaded yet (SHERLO-1707)
      bundleSizeMb: result.bundleSizeMb,
      assetsUrl: result.assetsDest ? '' : undefined, // placeholder (SHERLO-1707)
    });
    console.log(
      chalk.dim(`  Staged config [${platform}]:`) +
        ` baseReference=${config.baseReference.slice(0, 8)}...` +
        ` bundleSizeMb=${config.bundleSizeMb}`
    );
    if (config.assetsUrl !== undefined) {
      console.log(chalk.dim('    assetsUrl present (placeholder)'));
    }
  }

  console.log(chalk.green('\n✓ Local pipeline complete (no server send - SHERLO-1707 pending)\n'));
  return { url: '' };
}

export default testBundled;
