/**
 * `sherlo test` - the ONE testing command.
 *
 * Every run renders a JS bundle built from the project as it is now - never the
 * bundle embedded in a native binary. The config file picks which of two roads
 * gets that bundle onto a device:
 *
 *   sherlo test   with `"simulation": "<path>"` in sherlo.config.json
 *     THE SIM ROAD. `<path>` names a declared source TREE that stands in for the
 *     real app - one JSON file per module, so a branch's diff reads like the
 *     source change it stands for and git merges two of them. The CLI derives
 *     the module manifest from that tree, uploads it and the world to staged
 *     slots, and opens a sim build - no bundler, no binary, no routing
 *     question. See ./simRun.ts. A sim world cannot be combined with the
 *     bundler-road supply flags; the combination is refused rather than
 *     half-honored.
 *
 *   sherlo test   with no simulation in the config
 *     THE STAGED ROAD. Every other push starts here: it asks whether this
 *     commit can be tested against the app build Sherlo already stores, and
 *     builds the platforms whose gate refuses. See ./stagedRun.ts.
 *
 * A Sherlo 2 binary path (`--android`, `--ios`) never reaches this file: start.ts
 * refuses it before the command runs.
 *
 * The staged road bundles, so `--bundle-dir` (hand over a prebuilt bundle
 * instead of bundling) works on it, with the checks that the directory
 * belongs to this project and is not stale.
 */
import { throwError } from '../../helpers';
import { Options } from '../../types';
import { endsAsPlatformNotInConfig } from './platformNotInConfig';
import simRun from './simRun';
import { resolveSimulationWorldPath, SIMULATION_CONFIG_FIELD } from './simWorld';
import stagedRun from './stagedRun';
import { THIS_COMMAND } from './constants';

async function test(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  // A `--platform` job whose config tests nothing on that platform ends here, green, before any
  // road: it joins no run, so the other job's run never waits for it (./platformNotInConfig).
  if (endsAsPlatformNotInConfig(passedOptions)) return { url: '' };

  const simWorldDirPath = resolveSimulationWorldPath(passedOptions);
  if (simWorldDirPath === undefined) return stagedRun(passedOptions);

  // The bundler-road modes produce or consume a real bundle; a sim run has no bundler for them
  // to speak about.
  const bundlerRoadFlag = [
    passedOptions.bundleDir !== undefined ? '--bundle-dir' : undefined,
    passedOptions.emitBundleDir !== undefined ? '--emit-bundle-dir' : undefined,
  ].find((flag) => flag !== undefined);

  if (bundlerRoadFlag !== undefined) {
    throwError({
      message:
        `\`${bundlerRoadFlag}\` belongs to the bundling roads, and \`${SIMULATION_CONFIG_FIELD}\` ` +
        'in the config file runs no bundler. Drop one of the two.',
    });
  }

  return simRun(passedOptions, simWorldDirPath);
}

export default test;
