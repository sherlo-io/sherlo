/**
 * Turn the action's inputs into the argument list for `sherlo test`.
 *
 * The CLI builds the app itself, so the action takes no build path. It takes a
 * platform and hands it on as `--platform`. It never passes `--token`: the CLI
 * reads SHERLO_TOKEN from the job's environment and refuses a missing one itself.
 */

/** Every argument after the executable, in the order the CLI documents them. */
export function buildTestArgs({ platform, config, projectRoot, bundleDir, emitBundleDir }) {
  return [
    'test',
    ...optionalFlag('--platform', platform),
    ...optionalFlag('--config', config),
    // The CLI's flag is camelCase (`--projectRoot`); the action's input is
    // kebab-case (`project-root`) because that is the convention CI users read.
    ...optionalFlag('--projectRoot', projectRoot),
    // A prebuilt bundle handed to the run, and the flag that produces one.
    ...optionalFlag('--bundle-dir', bundleDir),
    ...optionalFlag('--emit-bundle-dir', emitBundleDir),
  ];
}

/* ========================================================================== */

/**
 * A flag and its value, or nothing at all. An input a caller left blank must not
 * reach the CLI as an empty string - the CLI's own default is the right answer.
 */
function optionalFlag(flag, value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return trimmed ? [flag, trimmed] : [];
}
