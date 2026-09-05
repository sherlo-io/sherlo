/**
 * `sherlo test` - the ONE testing command.
 *
 * Every run renders a JS bundle built from the project as it is now - never the
 * bundle embedded in a native binary. The flags you pass pick which of two
 * roads gets that bundle onto a device:
 *
 *   sherlo test
 *     THE STAGED ROAD. No native build paths were given, so the command asks
 *     whether this commit can be tested against the already-registered native
 *     base. It answers with `native-needed=<true|false>` on stdout. On `false` it
 *     has already built the JS bundle and run the
 *     test to completion. On `true` it built NOTHING and ran NOTHING - the
 *     caller routes to its own native-build job and comes back down the other
 *     road. See ./stagedRun.ts and ./nativeNeeded.ts.
 *
 *   sherlo test --android <path> [--ios <path>]
 *     THE STANDARD ROAD. Native builds were handed to the command, so it
 *     uploads them, REGISTERS them as the new base - which is what makes the
 *     staged road available on the next commit - and runs a full test on them
 *     with the freshly built bundle spliced in. See ./standardRun.ts - the
 *     one implementation of a full run.
 *
 * Between those two the road is chosen by the FLAGS, never by the config file: a
 * caller that passes no `--android`/`--ios` is asking the routing question,
 * whatever paths sherlo.config.json happens to carry.
 *
 *   sherlo test   with `"simulation": "<path>"` in sherlo.config.json
 *     THE SIM ROAD. `<path>` names a declared source TREE that stands in for the
 *     real app - one JSON file per module, so a branch's diff reads like the
 *     source change it stands for and git merges two of them. The CLI derives
 *     the module manifest from that tree, uploads it and the world to staged
 *     slots, and opens a sim build - no bundler, no binary, no routing
 *     question. See ./simRun.ts. A sim world cannot be combined with native
 *     build paths or the bundler-road preview/supply flags; the combinations
 *     are refused rather than half-honored.
 *
 * Both non-sim roads bundle, so `--bundle-dir` (hand over a prebuilt bundle
 * instead of bundling) works on both, with the same checks that the directory
 * belongs to this project and is not stale. The remaining staged-only flags are
 * refused with build paths rather than silently ignored.
 */
import { ANDROID_OPTION, IOS_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import { Options } from '../../types';
import simRun from './simRun';
import { resolveSimulationWorldPath, SIMULATION_CONFIG_FIELD } from './simWorld';
import stagedRun from './stagedRun';
import standardRun from './standardRun';
import { THIS_COMMAND } from './constants';

async function test(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  const hasNativeBuildPaths = Boolean(passedOptions[ANDROID_OPTION] || passedOptions[IOS_OPTION]);

  const simWorldDirPath = resolveSimulationWorldPath(passedOptions);
  if (simWorldDirPath !== undefined) {
    const simTrigger = `\`${SIMULATION_CONFIG_FIELD}\` in the config file`;

    // A sim world IS the app, so a native binary alongside it could only test
    // something else. Refuse rather than pick one silently.
    if (hasNativeBuildPaths) {
      throwError({
        message:
          `${simTrigger} tests a declared world instead of a real app, so it cannot be ` +
          `combined with \`--${ANDROID_OPTION}\` / \`--${IOS_OPTION}\`. Drop the build paths, ` +
          'or remove the field to test real builds.',
      });
    }

    // The bundler-road modes preview/produce/consume a real bundle; a sim run
    // has no bundler for them to speak about.
    const bundlerRoadFlag = [
      passedOptions.dryRun === true ? '--dry-run' : undefined,
      passedOptions.bundleDir !== undefined ? '--bundle-dir' : undefined,
      passedOptions.emitBundleDir !== undefined ? '--emit-bundle-dir' : undefined,
      passedOptions.emitExpectation !== undefined ? '--emit-expectation' : undefined,
      passedOptions.renderTranscript !== undefined ? '--render-transcript' : undefined,
      passedOptions.renderTranscriptState !== undefined ? '--render-transcript-state' : undefined,
    ].find((flag) => flag !== undefined);

    if (bundlerRoadFlag !== undefined) {
      throwError({
        message:
          `\`${bundlerRoadFlag}\` belongs to the bundling roads, and ${simTrigger} runs no ` +
          'bundler. Drop one of the two.',
      });
    }

    return simRun(passedOptions, simWorldDirPath);
  }

  if (!hasNativeBuildPaths) {
    return stagedRun(passedOptions);
  }

  // --dry-run / --emit-expectation preview what the staged road would decide
  // and create no build. The standard road always creates one, so there is
  // nothing for them to preview there. Refuse the combination rather than
  // silently ignoring the flag.
  if (passedOptions.dryRun === true || passedOptions.emitExpectation !== undefined) {
    throwError({
      message:
        '`--dry-run` and `--emit-expectation` preview the staged (JS-only) road, so they cannot be ' +
        `combined with \`--${ANDROID_OPTION}\` / \`--${IOS_OPTION}\`. Drop the build paths to preview.`,
    });
  }

  // --emit-bundle-dir writes a bundle directory and exits without a run, so a
  // build path handed to it would be uploaded for nothing. Refuse it rather than
  // ignore either half of the request.
  if (passedOptions.emitBundleDir !== undefined) {
    throwError({
      message:
        '`--emit-bundle-dir` produces a bundle directory and exits, so it cannot be ' +
        `combined with \`--${ANDROID_OPTION}\` / \`--${IOS_OPTION}\`. Drop the build paths.`,
    });
  }

  return standardRun(passedOptions);
}

export default test;
