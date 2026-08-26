/**
 * `sherlo test` - the ONE testing command.
 *
 * It has exactly two roads, and the flags you pass pick the road:
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
 *     THE STANDARD ROAD. Native builds were handed to the command, so it runs a
 *     full test on them and REGISTERS them as the new base - which is what makes
 *     the staged road available on the next commit. Delegated verbatim to the
 *     standard road so there is exactly one implementation of a full run.
 *
 * The road is chosen by the FLAGS, never by the config file: a caller that
 * passes no `--android`/`--ios` is asking the routing question, whatever paths
 * sherlo.config.json happens to carry.
 */
import { ANDROID_OPTION, IOS_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import { Options } from '../../types';
import testStandard from '../testStandard';
import stagedRun from './stagedRun';
import { THIS_COMMAND } from './constants';

async function test(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  const hasNativeBuildPaths = Boolean(passedOptions[ANDROID_OPTION] || passedOptions[IOS_OPTION]);

  if (!hasNativeBuildPaths) {
    return stagedRun(passedOptions);
  }

  // --dry-run / --emit-expectation preview the BUNDLING decision, which the
  // standard road never makes. Refuse the combination rather than silently
  // ignoring the flag.
  if (passedOptions.dryRun === true || passedOptions.emitExpectation !== undefined) {
    throwError({
      message:
        '`--dry-run` and `--emit-expectation` preview the staged (JS-only) road, so they cannot be ' +
        `combined with \`--${ANDROID_OPTION}\` / \`--${IOS_OPTION}\`. Drop the build paths to preview.`,
    });
  }

  // The bundle-supply flags act on the staged road's bundling step, which the
  // standard road does not have. Silently ignoring them would be the worst
  // outcome: a caller who passed --bundle-dir to save the bundling time would
  // still pay it, on every run, with nothing on screen to say why.
  if (passedOptions.bundleDir !== undefined || passedOptions.emitBundleDir !== undefined) {
    throwError({
      message:
        '`--bundle-dir` and `--emit-bundle-dir` act on the staged (JS-only) road, so they cannot be ' +
        `combined with \`--${ANDROID_OPTION}\` / \`--${IOS_OPTION}\`. Drop the build paths.`,
    });
  }

  return testStandard(passedOptions);
}

export default test;
