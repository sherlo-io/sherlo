/**
 * Turn the action's inputs into the argument list for the ONE verb, `sherlo test`.
 *
 * The verb picks its own road from the flags: given no build paths it asks the
 * routing question (the JS-only staged road); given `--android` / `--ios` it runs
 * a full test on those builds and registers them as the new base. The action
 * therefore has no "mode" input - passing a binary path IS the choice.
 */

/** Every argument after the executable, in the order the CLI documents them. */
export function buildTestArgs({
  token,
  config,
  projectRoot,
  android,
  ios,
  bundleDir,
  emitBundleDir,
}) {
  if (!token) {
    throw new Error(
      "No Sherlo token was given. Pass it as the action's `token` input, e.g. " +
        'token: ${{ secrets.SHERLO_TOKEN }}'
    );
  }

  return [
    'test',
    '--token',
    token,
    ...optionalFlag('--config', config),
    // The CLI's flag is camelCase (`--projectRoot`); the action's input is
    // kebab-case (`project-root`) because that is the convention CI users read.
    ...optionalFlag('--projectRoot', projectRoot),
    ...optionalFlag('--android', android),
    ...optionalFlag('--ios', ios),
    // A prebuilt bundle handed to the run, and the flag that produces one. With
    // `--bundle-dir` the job needs no bundler and no node_modules of its own: the
    // CLI checks the directory's sidecar against the checkout and the lockfile.
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
