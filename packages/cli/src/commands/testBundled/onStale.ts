/**
 * `--on-stale` handling for test:bundled (SHERLO-1692).
 *
 * The staged gate (checkStagedGate) can find the registered base stale - the
 * native inputs moved since the base was built, so the JS-only fast path can't
 * be reused. What happens then is controlled by `--on-stale`:
 *
 *   - `fail` (DEFAULT) - refuse explicitly with a message naming the fingerprint
 *     diff (which sources moved). Tests are NEVER silently skipped.
 *
 *   - `build` - run the user-declared per-platform shell commands from
 *     `sherlo.config.json` at `staged.fullBuild.{android,ios}` (in order per
 *     platform; they leave the binary at the config's `android`/`ios` path),
 *     then proceed as a FULL run that registers a fresh base - i.e. delegate to
 *     `test:standard`, which already registers a base via the fingerprint module.
 *
 * The default WITHOUT any `fullBuild` config is the explicit diff-bearing
 * failure, never a silent skip.
 */
import chalk from 'chalk';
import { CommandParams, Options } from '../../types';
import { reporting, runShellCommand } from '../../helpers';
import testStandard from '../testStandard';
import { THIS_COMMAND } from './constants';
import { formatStagedGateRefusal, type StagedGateRefusal } from './stagedGateRefusal';

export type OnStaleMode = 'fail' | 'build';

/**
 * Read and validate the `--on-stale` option. Defaults to `fail`; any value
 * other than `fail` / `build` is rejected so a typo never silently skips tests.
 */
export function getOnStaleMode(passedOptions: Options<THIS_COMMAND>): OnStaleMode {
  const raw = passedOptions.onStale;

  if (raw === undefined || raw === 'fail') return 'fail';
  if (raw === 'build') return 'build';

  throw new Error(`Invalid --on-stale value "${raw}". Expected "fail" or "build".`);
}

/**
 * Route a stale base according to `--on-stale`.
 *
 * `fail`  -> print the diff-bearing refusal(s) and exit non-zero (never returns).
 * `build` -> run the configured fullBuild commands, then complete as a full
 *            test:standard run that registers the fresh base.
 */
export async function handleStaleBase({
  onStale,
  refusals,
  commandParams,
  passedOptions,
}: {
  onStale: OnStaleMode;
  refusals: StagedGateRefusal[];
  commandParams: CommandParams<THIS_COMMAND>;
  passedOptions: Options<THIS_COMMAND>;
}): Promise<{ url: string }> {
  if (onStale === 'build') {
    return buildThenFullRun({ refusals, commandParams, passedOptions });
  }

  return failWithDiff(refusals);
}

/* ========================================================================== */

/** `--on-stale=fail`: print every refusal's named diff, then exit non-zero. */
async function failWithDiff(refusals: StagedGateRefusal[]): Promise<never> {
  for (const refusal of refusals) {
    console.log(chalk.red(`\n${formatStagedGateRefusal(refusal)}`));
  }

  await reporting.flush().finally(() => process.exit(1));

  // Unreachable - process.exit above never returns.
  throw new Error('unreachable');
}

/**
 * `--on-stale=build`: run the configured per-platform fullBuild commands, then
 * hand off to test:standard for a full run that registers the fresh base.
 */
async function buildThenFullRun({
  refusals,
  commandParams,
  passedOptions,
}: {
  refusals: StagedGateRefusal[];
  commandParams: CommandParams<THIS_COMMAND>;
  passedOptions: Options<THIS_COMMAND>;
}): Promise<{ url: string }> {
  const fullBuild = commandParams.staged?.fullBuild;

  // No fullBuild config -> we cannot rebuild. Fail explicitly with the diff so
  // tests are never silently skipped.
  if (!fullBuild || (!fullBuild.android && !fullBuild.ios)) {
    console.log(
      chalk.red(
        '\n✗ --on-stale=build needs build commands, but `staged.fullBuild` is missing from ' +
          'sherlo.config.json. Add `staged.fullBuild.android` / `staged.fullBuild.ios` commands, ' +
          'or run `sherlo test:standard` for a full build.'
      )
    );
    return failWithDiff(refusals);
  }

  // Rebuild every stale platform. A stale platform with no configured commands
  // cannot be rebuilt -> fail explicitly rather than skip it.
  const stalePlatforms = refusals.map((refusal) => refusal.platform);
  const missing = stalePlatforms.filter((platform) => !fullBuild[platform]?.length);
  if (missing.length > 0) {
    console.log(
      chalk.red(
        `\n✗ --on-stale=build: no \`staged.fullBuild\` commands configured for ${missing.join(
          ', '
        )}. Add them to sherlo.config.json or run \`sherlo test:standard\`.`
      )
    );
    return failWithDiff(refusals);
  }

  for (const platform of stalePlatforms) {
    const commands = fullBuild[platform] ?? [];
    console.log(chalk.bold(`\n🔨 Rebuilding ${platform} (staged.fullBuild)...`));

    for (const command of commands) {
      console.log(chalk.cyan(`  $ ${command}`));
      await runShellCommand({ command, projectRoot: commandParams.projectRoot });
    }
  }

  console.log(
    chalk.bold('\n✅ Full build complete - running a full test that registers a fresh base...\n')
  );

  // Delegate to test:standard: it reads the freshly built binaries from the
  // config's android/ios paths and registers the new base via the fingerprint
  // module. Reusing it keeps the base-registration logic in ONE place.
  return testStandard(passedOptions);
}
